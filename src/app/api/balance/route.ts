import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
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

    // Check if API key is configured
    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json(
        { error: "Etherscan API key is not configured" },
        { status: 500 }
      );
    }

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);

    // Get current block number with error handling
    let currentBlockNumber: number;
    try {
      const currentBlockResponse = await axios.get(ETHERSCAN_BASE_URL, {
        params: {
          module: "proxy",
          action: "eth_blockNumber",
          apikey: ETHERSCAN_API_KEY,
        },
      });

      // Check for API errors
      if (currentBlockResponse.data.status === "0") {
        if (currentBlockResponse.data.message === "NOTOK") {
          console.error("API rate limit exceeded getting current block");
          return NextResponse.json(
            {
              error:
                "Etherscan API rate limit exceeded. Please try again later.",
            },
            { status: 429 }
          );
        }
        throw new Error(`API error: ${currentBlockResponse.data.message}`);
      }

      if (!currentBlockResponse.data.result) {
        throw new Error("Failed to get current block number");
      }

      currentBlockNumber = parseInt(currentBlockResponse.data.result, 16);
    } catch (error) {
      console.error("Error getting current block:", error);
      return NextResponse.json(
        { error: "Failed to get current block number from Etherscan" },
        { status: 500 }
      );
    }

    // Get current block timestamp with error handling
    let currentBlockTimestamp: number;
    try {
      const currentBlockData = await axios.get(ETHERSCAN_BASE_URL, {
        params: {
          module: "proxy",
          action: "eth_getBlockByNumber",
          tag: "0x" + currentBlockNumber.toString(16),
          boolean: false,
          apikey: ETHERSCAN_API_KEY,
        },
      });

      // Check for API errors
      if (currentBlockData.data.status === "0") {
        if (currentBlockData.data.message === "NOTOK") {
          console.error(
            "API rate limit exceeded getting current block timestamp"
          );
          return NextResponse.json(
            {
              error:
                "Etherscan API rate limit exceeded. Please try again later.",
            },
            { status: 429 }
          );
        }
        throw new Error(`API error: ${currentBlockData.data.message}`);
      }

      if (!currentBlockData.data.result?.timestamp) {
        throw new Error("Failed to get current block timestamp");
      }

      currentBlockTimestamp = parseInt(
        currentBlockData.data.result.timestamp,
        16
      );
    } catch {
      console.error("Error getting current block timestamp");
      return NextResponse.json(
        { error: "Failed to get current block timestamp from Etherscan" },
        { status: 500 }
      );
    }

    if (targetTimestamp >= currentBlockTimestamp) {
      try {
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
      } catch {
        console.error("Error getting current balance");
        return NextResponse.json(
          { error: "Failed to get current balance from Etherscan" },
          { status: 500 }
        );
      }
    }

    // Optimized binary search with rate limit handling
    let low = 1;
    let high = currentBlockNumber;
    let closestBlock = currentBlockNumber;
    let closestTimestamp = currentBlockTimestamp;
    let attempts = 0;
    const maxAttempts = 8; // Further reduced to avoid rate limits

    for (let i = 0; i < maxAttempts; i++) {
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

        // Check for API errors
        if (blockData.data.status === "0") {
          if (blockData.data.message === "NOTOK") {
            console.error("API rate limit exceeded during binary search");
            return NextResponse.json(
              {
                error:
                  "Etherscan API rate limit exceeded. Please try again later.",
              },
              { status: 429 }
            );
          }
          console.warn(`Block ${mid} API error: ${blockData.data.message}`);
          continue;
        }

        if (!blockData.data.result?.timestamp) {
          console.warn(`Block ${mid} has no timestamp, skipping`);
          continue;
        }

        const blockTimestamp = parseInt(blockData.data.result.timestamp, 16);

        // Update closest block if this one is closer
        if (
          Math.abs(blockTimestamp - targetTimestamp) <
          Math.abs(closestTimestamp - targetTimestamp)
        ) {
          closestBlock = mid;
          closestTimestamp = blockTimestamp;
        }

        if (blockTimestamp < targetTimestamp) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }

        // If we're within 2 hours of target, that's good enough
        if (Math.abs(blockTimestamp - targetTimestamp) < 7200) {
          break;
        }

        attempts++;

        // Add small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`Failed to get block ${mid}, continuing search`);
        // Skip this block and continue
        if (mid < closestBlock) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
        continue;
      }
    }

    console.log(
      `Binary search completed in ${attempts} attempts. Closest block: ${closestBlock}`
    );

    // Get balance at the closest block
    try {
      const balance = await getBalanceAtBlock(walletAddress, closestBlock);

      return NextResponse.json({
        success: true,
        balance,
        block: closestBlock,
        timestamp: new Date(closestTimestamp * 1000).toISOString(),
        date: targetDate.toISOString().split("T")[0],
        requestedTimestamp: targetTimestamp,
        actualTimestamp: closestTimestamp,
        timeDifference: Math.abs(closestTimestamp - targetTimestamp),
      });
    } catch {
      console.error("Failed to get balance for closest block");
      return NextResponse.json(
        { error: "Failed to retrieve balance for the target date" },
        { status: 500 }
      );
    }
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

  // Check for API errors
  if (response.data.status === "0") {
    if (response.data.message === "NOTOK") {
      throw new Error("Etherscan API rate limit exceeded");
    }
    throw new Error(`API error: ${response.data.message}`);
  }

  if (!response.data.result) {
    throw new Error("Failed to get balance");
  }

  // Convert Wei to ETH
  const balanceWei = response.data.result;
  const balanceEth = (parseInt(balanceWei) / 1e18).toFixed(8);

  return balanceEth;
}
