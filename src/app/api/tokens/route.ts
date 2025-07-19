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

    // Fetch ERC-20 token transfers
    const tokenTransfersResponse = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "account",
        action: "tokentx",
        address: walletAddress,
        startblock: startBlock,
        endblock: currentBlock,
        page: 1,
        offset: 10000,
        sort: "desc",
        apikey: ETHERSCAN_API_KEY,
      },
    });

    // Fetch ERC-721 NFT transfers
    const nftTransfersResponse = await axios.get(ETHERSCAN_BASE_URL, {
      params: {
        module: "account",
        action: "tokennfttx",
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
    if (tokenTransfersResponse.data.status === "0") {
      if (tokenTransfersResponse.data.message === "No transactions found") {
        console.log("No token transfers found for this address");
      } else if (tokenTransfersResponse.data.message === "NOTOK") {
        console.error("Token transfers API rate limit or invalid key");
        return NextResponse.json(
          { error: "Etherscan API rate limit exceeded or invalid API key" },
          { status: 429 }
        );
      } else {
        console.error(
          "Token transfers API error:",
          tokenTransfersResponse.data.message
        );
        return NextResponse.json(
          {
            error: `Token transfers API error: ${tokenTransfersResponse.data.message}`,
          },
          { status: 500 }
        );
      }
    }

    if (nftTransfersResponse.data.status === "0") {
      if (nftTransfersResponse.data.message === "No transactions found") {
        console.log("No NFT transfers found for this address");
      } else if (
        nftTransfersResponse.data.message === "NOTOK" ||
        tokenTransfersResponse.data.message === "UnExpected Exception#1"
      ) {
        console.error("NFT transfers API rate limit or invalid key");
        return NextResponse.json(
          { error: "Etherscan API rate limit exceeded or invalid API key" },
          { status: 429 }
        );
      } else {
        console.error(
          "NFT transfers API error:",
          nftTransfersResponse.data.message
        );
        return NextResponse.json(
          {
            error: `NFT transfers API error: ${nftTransfersResponse.data.message}`,
          },
          { status: 500 }
        );
      }
    }

    const tokenTransfers = Array.isArray(tokenTransfersResponse.data.result)
      ? tokenTransfersResponse.data.result
      : [];
    const nftTransfers = Array.isArray(nftTransfersResponse.data.result)
      ? nftTransfersResponse.data.result
      : [];

    // Format ERC-20 token transfers
    const formattedTokenTransfers = tokenTransfers.map((transfer: any) => {
      const decimals = parseInt(transfer.tokenDecimal) || 18;
      const value = transfer.value
        ? parseInt(transfer.value) / Math.pow(10, decimals)
        : 0;

      return {
        hash: transfer.hash,
        from: transfer.from,
        to: transfer.to,
        value: value.toFixed(6),
        tokenSymbol: transfer.tokenSymbol,
        tokenName: transfer.tokenName,
        contractAddress: transfer.contractAddress,
        block: parseInt(transfer.blockNumber),
        timestamp: new Date(parseInt(transfer.timeStamp) * 1000).toISOString(),
        type: "ERC-20",
        tokenDecimal: decimals,
        direction:
          transfer.to?.toLowerCase() === walletAddress.toLowerCase()
            ? "in"
            : "out",
      };
    });

    const formattedNftTransfers = nftTransfers.map((transfer: any) => ({
      hash: transfer.hash,
      from: transfer.from,
      to: transfer.to,
      value: "1",
      tokenSymbol: transfer.tokenSymbol,
      tokenName: transfer.tokenName,
      contractAddress: transfer.contractAddress,
      block: parseInt(transfer.blockNumber),
      timestamp: new Date(parseInt(transfer.timeStamp) * 1000).toISOString(),
      type: "ERC-721",
      tokenId: transfer.tokenID,
      direction:
        transfer.to?.toLowerCase() === walletAddress.toLowerCase()
          ? "in"
          : "out",
    }));

    const allTransfers = [
      ...formattedTokenTransfers,
      ...formattedNftTransfers,
    ].sort((a, b) => b.block - a.block);

    const uniqueTransfers = allTransfers.filter(
      (transfer, index, self) =>
        index ===
        self.findIndex(
          (t) =>
            t.hash === transfer.hash &&
            t.contractAddress === transfer.contractAddress
        )
    );

    const tokenSummary = uniqueTransfers.reduce((acc: any, transfer) => {
      const key = transfer.contractAddress;
      if (!acc[key]) {
        acc[key] = {
          contractAddress: transfer.contractAddress,
          tokenSymbol: transfer.tokenSymbol,
          tokenName: transfer.tokenName,
          type: transfer.type,
          totalTransfers: 0,
          totalIn: 0,
          totalOut: 0,
        };
      }

      acc[key].totalTransfers += 1;

      if (transfer.direction === "in") {
        acc[key].totalIn += parseFloat(transfer.value);
      } else {
        acc[key].totalOut += parseFloat(transfer.value);
      }

      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      transfers: uniqueTransfers,
      summary: Object.values(tokenSummary),
      totalCount: uniqueTransfers.length,
      blockRange: {
        start: parseInt(startBlock),
        end: parseInt(currentBlock || startBlock),
      },
    });
  } catch (error) {
    console.error("Error fetching token transfers:", error);

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message =
        error.response?.data?.message || "Failed to fetch token transfers";
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
