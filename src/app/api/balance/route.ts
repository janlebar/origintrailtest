import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "YourApiKeyToken";
const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, date } = await request.json();

    if (!walletAddress || !date) {
      return NextResponse.json(
        { error: "Wallet address and date are required" },
        { status: 400 }
      );
    }

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);

    const currentBlockResponse = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "proxy",
        action: "eth_blockNumber",
        apikey: ETHERSCAN_API_KEY,
      },
    });

    if (!currentBlockResponse.data.result) {
      throw new Error("Failed to get current block number");
    }

    const currentBlockNumber = parseInt(currentBlockResponse.data.result, 16);

    const currentBlockData = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "proxy",
        action: "eth_getBlockByNumber",
        tag: "0x" + currentBlockNumber.toString(16),
        boolean: false,
        apikey: ETHERSCAN_API_KEY,
      },
    });

    const currentBlockTimestamp = parseInt(
      currentBlockData.data.result.timestamp,
      16
    );

    if (targetTimestamp >= currentBlockTimestamp) {
      const balance = await getBalanceAtBlock(
        walletAddress,
        currentBlockNumber
      );
      return NextResponse.json({
        success: true,
        balance,
        block: currentBlockNumber,
        timestamp: new Date(currentBlockTimestamp * 1000).toISOString(),
        date: targetDate.toISOString().split("T")[0],
        note: "Target date is in the future, showing current balance",
      });
    }

    // Binary search
    let low = 1;
    let high = currentBlockNumber;
    let closestBlock = currentBlockNumber;

    for (let i = 0; i < 20; i++) {
      const mid = Math.floor((low + high) / 2);

      try {
        const blockData = await axios.get(ETHERSCAN_BASE_URL, {
          params: {
            module: "proxy",
            action: "eth_getBlockByNumber",
            tag: "0x" + mid.toString(16),
            boolean: false,
            apikey: ETHERSCAN_API_KEY,
          },
        });

        const blockTimestamp = parseInt(blockData.data.result.timestamp, 16);

        if (
          Math.abs(blockTimestamp - targetTimestamp) <
          Math.abs(
            parseInt(await getBlockTimestamp(closestBlock)) - targetTimestamp
          )
        ) {
          closestBlock = mid;
        }

        if (blockTimestamp < targetTimestamp) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }

        if (Math.abs(blockTimestamp - targetTimestamp) < 3600) {
          break;
        }
      } catch (error) {
        console.warn(`Failed to get block ${mid}, continuing search`);
        break;
      }
    }

    // Get balance at the closest block
    const balance = await getBalanceAtBlock(walletAddress, closestBlock);
    const blockTimestamp = await getBlockTimestamp(closestBlock);

    return NextResponse.json({
      success: true,
      balance,
      block: closestBlock,
      timestamp: new Date(parseInt(blockTimestamp) * 1000).toISOString(),
      date: targetDate.toISOString().split("T")[0],
      requestedTimestamp: targetTimestamp,
      actualTimestamp: parseInt(blockTimestamp),
      timeDifference: Math.abs(parseInt(blockTimestamp) - targetTimestamp),
    });
  } catch (error) {
    console.error("Error fetching historical balance:", error);

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message =
        error.response?.data?.message || "Failed to fetch historical balance";
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getBalanceAtBlock(
  address: string,
  blockNumber: number
): Promise<string> {
  const response = await axios.get(ETHERSCAN_BASE_URL, {
    params: {
      module: "account",
      action: "balance",
      address: address,
      tag: "0x" + blockNumber.toString(16),
      apikey: ETHERSCAN_API_KEY,
    },
  });

  if (!response.data.result) {
    throw new Error("Failed to get balance");
  }

  // Convert Wei to ETH
  const balanceWei = response.data.result;
  const balanceEth = (parseInt(balanceWei) / 1e18).toFixed(8);

  return balanceEth;
}

async function getBlockTimestamp(blockNumber: number): Promise<string> {
  const response = await axios.get(ETHERSCAN_BASE_URL, {
    params: {
      module: "proxy",
      action: "eth_getBlockByNumber",
      tag: "0x" + blockNumber.toString(16),
      boolean: false,
      apikey: ETHERSCAN_API_KEY,
    },
  });

  if (!response.data.result?.timestamp) {
    throw new Error("Failed to get block timestamp");
  }

  return parseInt(response.data.result.timestamp, 16).toString();
}
