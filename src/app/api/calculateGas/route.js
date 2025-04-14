import axios from 'axios';
import { formatEther } from 'ethers';

const API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const NETWORK = 'eth-mainnet';
const HISTORY_API_URL = `https://api.g.alchemy.com/data/v1/${API_KEY}/transactions/history/by-address`;

/**
 * Fetch transaction history for the given address.
 * The API response returns transactions under the "transactions" key.
 */
async function fetchTransactionHistory(address) {
  let transactions = [];
  let hasMore = true;
  let beforeCursor = undefined;

  while (hasMore) {
    const data = {
      addresses: [{ address, networks: [NETWORK] }],
      limit: 50 // Maximum allowed limit.
    };
    if (beforeCursor) {
      data.before = beforeCursor;
    }

    try {
      const response = await axios.post(HISTORY_API_URL, data);
      const { transactions: txs, before } = response.data;
      if (txs && Array.isArray(txs) && txs.length > 0) {
        transactions = transactions.concat(txs);
        if (before) {
          beforeCursor = before;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error("Error fetching transaction history:", error.response?.data || error.message);
      throw error;
    }
  }
  return transactions;
}

/**
 * Fetch the historical USD price for ETH at a given timestamp.
 * We query a 1-hour window (from timestamp to timestamp+3600000ms) using an interval of "1h".
 */
async function fetchHistoricalETHPrice(timestamp) {
  const startDate = new Date(Number(timestamp));
  const endDate = new Date(Number(timestamp) + 3600000);
  const startTime = startDate.toISOString();
  const endTime = endDate.toISOString();

  const body = {
    symbol: "ETH",       // Use "symbol" as required by the endpoint.
    startTime: startTime,
    endTime: endTime,
    interval: "1h"
  };

  try {
    const response = await axios.post(`https://api.g.alchemy.com/prices/v1/${API_KEY}/tokens/historical`, body);
    if (
      response.data &&
      response.data.data &&
      Array.isArray(response.data.data) &&
      response.data.data.length > 0
    ) {
      const priceObj = response.data.data[0];
      return parseFloat(priceObj.value);
    }
    console.warn(`Historical price not found for timestamp ${startTime} - ${endTime}`);
    return null;
  } catch (error) {
    console.error("Error fetching historical ETH price:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Calculate the total gas cost for an address.
 * For each transaction, we compute the cost (in wei and ETH) and attempt to fetch its historical USD price.
 * We accumulate an array of per-transaction details.
 */
async function calculateTotalGasCost(address) {
  const transactions = await fetchTransactionHistory(address);

  let totalGasCostWei = 0n;
  let totalGasCostETH = 0.0;
  let totalGasCostUSD = 0.0;
  let txCosts = [];

  // Maintain the last valid historical price.
  let lastValidPrice = null;

  for (const tx of transactions) {
    // Use tx.gasUsed or fallback to tx.gas if not available.
    const gasUsedValue = tx.gasUsed || tx.gas;
    if (!gasUsedValue) {
      console.warn(`Transaction ${tx.hash} missing gasUsed/gas, skipping.`);
      continue;
    }
    // Use effectiveGasPrice if available; fallback to gasPrice.
    const gasPriceValue = tx.effectiveGasPrice || tx.gasPrice;
    if (!gasPriceValue) {
      console.warn(`Transaction ${tx.hash} missing effectiveGasPrice/gasPrice, skipping.`);
      continue;
    }

    try {
      const gasUsedBig = BigInt(gasUsedValue);
      const gasPriceBig = BigInt(gasPriceValue);
      const txCostWei = gasUsedBig * gasPriceBig;
      const txCostETH = parseFloat(formatEther(txCostWei));

      if (!tx.blockTimestamp) {
        console.warn(`Transaction ${tx.hash} missing blockTimestamp, skipping historical price lookup.`);
        continue;
      }

      let histPriceUSD = await fetchHistoricalETHPrice(tx.blockTimestamp);
      // If the historical price is not found, use the last valid price if available.
      if (histPriceUSD === null) {
        if (lastValidPrice !== null) {
          histPriceUSD = lastValidPrice;
          console.warn(`Using last valid historical price for transaction ${tx.hash}`);
        } else {
          console.warn(`Skipping transaction ${tx.hash} due to missing historical price and no prior price available.`);
          continue;
        }
      } else {
        // Update lastValidPrice if this transaction returns a valid historical price.
        lastValidPrice = histPriceUSD;
      }

      const txCostUSD = txCostETH * histPriceUSD;

      totalGasCostWei += txCostWei;
      totalGasCostETH += txCostETH;
      totalGasCostUSD += txCostUSD;

      txCosts.push({
        hash: tx.hash,
        timestamp: tx.blockTimestamp,
        costETH: txCostETH,
        costUSD: txCostUSD
      });
    } catch (error) {
      console.error(`Error processing transaction ${tx.hash}:`, error.message);
    }
  }
  
  return {
    totalGasCostWei: totalGasCostWei.toString(),
    totalGasCostETH: totalGasCostETH.toString(),
    totalGasCostUSD: totalGasCostUSD.toFixed(2),
    transactionCosts: txCosts
  };
}

/**
 * GET handler for the API route.
 * Expects a query parameter "address".
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address parameter" }), { status: 400 });
  }
  try {
    const result = await calculateTotalGasCost(address);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error in API route GET:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}