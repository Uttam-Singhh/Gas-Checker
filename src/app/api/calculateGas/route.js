import axios from 'axios';
import { formatEther } from 'ethers';

const API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const NETWORK = 'eth-mainnet';
const HISTORY_API_URL = `https://api.g.alchemy.com/data/v1/${API_KEY}/transactions/history/by-address`;

/**
 * Fetch transaction history for the given address using pagination.
 * This function uses the "before" cursor returned from the API to fetch all pages.
 */
async function fetchTransactionHistory(address) {
  let transactions = [];
  let hasMore = true;
  let cursor = undefined; // Renamed variable
  let page = 1;

  while (hasMore) {
    // Prepare the request payload with a limit (max 50)
    const data = {
      addresses: [{ address, networks: [NETWORK] }],
      limit: 50
    };
    // If a cursor was returned, include it in the next request as "after"
    if (cursor) {
      data.after = cursor;
    }

    console.log(`Fetching page ${page} with cursor: ${cursor || "none"}`);

    try {
      const response = await axios.post(HISTORY_API_URL, data);

      // Destructure the transactions array and the "after" cursor from the response.
      const { transactions: txs, after } = response.data;

      if (txs && Array.isArray(txs) && txs.length > 0) {
        transactions = transactions.concat(txs);
        if (after) {
          cursor = after;
          page++;
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
  console.log(`Total transactions fetched: ${transactions.length}`);
  return transactions;
}

/**
 * Fetch the historical USD price for ETH at a given timestamp.
 * We query a 1-hour window (from the timestamp to timestamp+3600000ms) using an interval of "1h".
 */
async function fetchHistoricalETHPrice(timestamp) {
  const startDate = new Date(Number(timestamp));
  const endDate = new Date(Number(timestamp) + 3600000);
  const startTime = startDate.toISOString();
  const endTime = endDate.toISOString();

  const body = {
    symbol: "ETH",
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
 * If a historical price isn't found for a transaction, the code uses the last valid price.
 * Returns overall totals and a breakdown per transaction.
 */
async function calculateTotalGasCost(address) {
  const transactions = await fetchTransactionHistory(address);

  let totalGasCostWei = 0n;
  let totalGasCostETH = 0.0;
  let totalGasCostUSD = 0.0;
  let txCosts = [];
  let lastValidPrice = null;

  for (const tx of transactions) {
    const gasUsedValue = tx.gasUsed || tx.gas;
    if (!gasUsedValue) {
      console.warn(`Transaction ${tx.hash} missing gasUsed/gas, skipping.`);
      continue;
    }
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
      if (histPriceUSD === null) {
        if (lastValidPrice !== null) {
          histPriceUSD = lastValidPrice;
          console.warn(`Using last valid historical price for transaction ${tx.hash}`);
        } else {
          console.warn(`Skipping transaction ${tx.hash} due to missing historical price and no prior price available.`);
          continue;
        }
      } else {
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