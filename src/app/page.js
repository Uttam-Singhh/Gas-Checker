"use client";

import { useState } from "react";
import { Bar } from "react-chartjs-2";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

// Register required modules for Chart.js.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setChartData(null);
    if (!address) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/calculateGas?address=${address}`);
      const data = await response.json();
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || "Unknown error");
      }
    } catch (err) {
      setError("Error fetching data");
    }
    setLoading(false);
  };

  const handleGenerateChart = () => {
    if (result && result.transactionCosts && result.transactionCosts.length > 0) {
      const labels = result.transactionCosts.map((tx) =>
        new Date(Number(tx.timestamp)).toLocaleString()
      );
      const usdCosts = result.transactionCosts.map((tx) => tx.costUSD);
      
      const data = {
        labels,
        datasets: [
          {
            label: "Gas Cost (USD) per Transaction",
            data: usdCosts,
            backgroundColor: "rgba(54, 162, 235, 0.5)"
          }
        ]
      };
      setChartData(data);
    }
  };

  // Framer Motion variants for animations.
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-900 via-purple-900 to-black">
      {/* Header area with a contrasting background */}
      <motion.div 
        initial="hidden" 
        animate="visible" 
        variants={containerVariants}
        className="flex items-center mb-8 p-4 bg-white bg-opacity-90 rounded shadow-lg"
      >
        <Image
          src="/alchemy-logo-blue-gradient.svg"
          alt="Alchemy Logo"
          width={180}
          height={60}
        />
        <h1 className="text-4xl font-bold ml-4 text-gray-800">Gas Checker App</h1>
      </motion.div>

      {/* Animated form */}
      <motion.form 
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white bg-opacity-90 shadow-md rounded px-8 py-6 mb-8"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <label htmlFor="address" className="block text-gray-700 text-sm font-bold mb-2">
          Wallet Address:
        </label>
        <input
          id="address"
          type="text"
          placeholder="0x..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-4 focus:outline-none"
        />
        <button
          type="submit"
          className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600"
          disabled={loading}
        >
          {loading ? "Calculating..." : "Check Gas Usage"}
        </button>
      </motion.form>

      {error && (
        <motion.p 
          className="text-red-500 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {error}
        </motion.p>
      )}

      {result && (
        <motion.div 
          className="mt-4 p-6 bg-white bg-opacity-90 rounded shadow-md w-full max-w-md"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Your Gas Cost Summary</h2>
          <p className="text-gray-700 mb-1">
            <strong>Total Transactions:</strong> {result.transactionCosts ? result.transactionCosts.length : 0}
          </p>
          <p className="text-gray-700 mb-1">
            <strong>Total Gas Cost:</strong> {result.totalGasCostWei} wei, {result.totalGasCostETH} ETH
          </p>
          <p className="text-gray-700 mb-4">
            <strong>Total Gas Cost (USD):</strong> ${result.totalGasCostUSD}
          </p>
          <button
            onClick={handleGenerateChart}
            className="mt-4 w-full bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-600"
          >
            Generate Chart
          </button>
        </motion.div>
      )}

      {chartData && (
        <motion.div 
          className="mt-6 w-full max-w-3xl bg-white bg-opacity-90 shadow-md rounded p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Bar data={chartData} options={{ plugins: { legend: { display: true } } }} />
        </motion.div>
      )}

      {/* Footer with API credits and links */}
      <motion.footer 
        className="mt-8 text-sm text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        Powered by Alchemy's{" "}
        <a
          href="https://docs.alchemy.com/reference/get-historical-token-prices"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-200 underline"
        >
          Historical Token Prices API
        </a>{" "}
        and{" "}
        <a
          href="https://docs.alchemy.com/reference/get-transaction-history-by-address"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-200 underline"
        >
          Transaction History By Address API
        </a>
      </motion.footer>
    </div>
  );
}