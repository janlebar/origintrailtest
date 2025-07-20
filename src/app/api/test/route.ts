import { NextResponse } from "next/server";
import axios from "axios";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_BASE_URL = "https://api.etherscan.io/api";

export async function GET() {
  try {
    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json(
        { error: "Etherscan API key is not configured" },
        { status: 500 }
      );
    }

    // Test the API key with a simple call
    const response = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "proxy",
        action: "eth_blockNumber",
        apikey: ETHERSCAN_API_KEY,
      },
    });

    if (response.data.result) {
      return NextResponse.json({
        success: true,
        message: "Etherscan API connection successful",
        currentBlock: parseInt(response.data.result, 16),
        apiKeyConfigured: true,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: "Etherscan API returned no result",
        error: response.data,
        apiKeyConfigured: true,
      });
    }
  } catch (error) {
    console.error("Etherscan API test error:", error);

    if (axios.isAxiosError(error)) {
      return NextResponse.json({
        success: false,
        message: "Etherscan API test failed",
        error: error.response?.data || error.message,
        apiKeyConfigured: !!ETHERSCAN_API_KEY,
      });
    }

    return NextResponse.json({
      success: false,
      message: "Unknown error occurred",
      error: error instanceof Error ? error.message : "Unknown error",
      apiKeyConfigured: !!ETHERSCAN_API_KEY,
    });
  }
}
