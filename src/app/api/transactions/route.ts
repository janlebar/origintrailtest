// Iused Axios because of better fetch

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json(
        { error: "Etherscan API key is not configured" },
        { status: 500 }
      );
    }

    // Pridobimo podatke
    // Extract data from request
    const { walletAddress, startBlock, endBlock } = await request.json();

    if (!walletAddress || !startBlock) {
      return NextResponse.json(
        { error: "Wallet address and start block are required" },
        { status: 400 }
      );
    }

    let currentBlock = endBlock;
    if (!currentBlock) {
      const blockResponse = await axios.get(ETHERSCAN_BASE_URL, {
        params: {
          module: "proxy",
          action: "eth_blockNumber",
          apikey: ETHERSCAN_API_KEY,
        },
      });

      if (blockResponse.data.result) {
        currentBlock = parseInt(blockResponse.data.result, 16).toString();
      }
    }

    const normalTxResponse = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "account",
        action: "txlist",
        address: walletAddress,
        startblock: startBlock,
        endblock: currentBlock,
        page: 1,
        offset: 10000,
        sort: "desc",
        apikey: ETHERSCAN_API_KEY,
      },
    });

    const internalTxResponse = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "account",
        action: "txlistinternal",
        address: walletAddress,
        startblock: startBlock,
        endblock: currentBlock,
        page: 1,
        offset: 10000,
        sort: "desc",
        apikey: ETHERSCAN_API_KEY,
      },
    });

    // Check for API errors and handle them gracefully
    if (normalTxResponse.data.status === "0") {
      if (normalTxResponse.data.message === "No transactions found") {
        console.log("No normal transactions found for this address");
      } else if (normalTxResponse.data.message === "NOTOK") {
        console.error("Normal transactions API rate limit or invalid key");
        return NextResponse.json(
          { error: "Etherscan API rate limit exceeded or invalid API key" },
          { status: 429 }
        );
      } else {
        console.error(
          "Normal transactions API error:",
          normalTxResponse.data.message
        );
        return NextResponse.json(
          {
            error: `Normal transactions API error: ${normalTxResponse.data.message}`,
          },
          { status: 500 }
        );
      }
    }

    if (internalTxResponse.data.status === "0") {
      if (internalTxResponse.data.message === "No transactions found") {
        console.log("No internal transactions found for this address");
      } else if (internalTxResponse.data.message === "NOTOK") {
        console.error("Internal transactions API rate limit or invalid key");
        return NextResponse.json(
          { error: "Etherscan API rate limit exceeded or invalid API key" },
          { status: 429 }
        );
      } else {
        console.error(
          "Internal transactions API error:",
          internalTxResponse.data.message
        );
        return NextResponse.json(
          {
            error: `Internal transactions API error: ${internalTxResponse.data.message}`,
          },
          { status: 500 }
        );
      }
    }

    const normalTransactions = Array.isArray(normalTxResponse.data.result)
      ? normalTxResponse.data.result
      : [];
    const internalTransactions = Array.isArray(internalTxResponse.data.result)
      ? internalTxResponse.data.result
      : [];

    const allTransactions = [...normalTransactions, ...internalTransactions]
      .map(
        (tx: {
          hash: string;
          from: string;
          to: string;
          value: string;
          blockNumber: string;
          timeStamp: string;
          gas: string;
          gasPrice: string;
          gasUsed: string;
          isError: string;
          methodId?: string;
          input?: string;
        }) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: (parseInt(tx.value) / 1e18).toFixed(6),
          block: parseInt(tx.blockNumber),
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
          gas: tx.gas,
          gasPrice: tx.gasPrice
            ? (parseInt(tx.gasPrice) / 1e9).toFixed(2)
            : "0",
          gasUsed: tx.gasUsed,
          type:
            tx.to?.toLowerCase() === walletAddress.toLowerCase() ? "in" : "out",
          isError: tx.isError === "1",
          methodId: tx.methodId || tx.input?.slice(0, 10),
        })
      )
      .sort((a, b) => b.block - a.block);

    const uniqueTransactions = allTransactions.filter(
      (tx, index, self) => index === self.findIndex((t) => t.hash === tx.hash)
    );

    return NextResponse.json({
      success: true,
      transactions: uniqueTransactions,
      totalCount: uniqueTransactions.length,
      blockRange: {
        start: parseInt(startBlock),
        end: parseInt(currentBlock || startBlock),
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message =
        error.response?.data?.message || "Failed to fetch transactions";
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
