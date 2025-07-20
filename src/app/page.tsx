"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Search, Wallet, TrendingUp, Clock, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Validacija z uporabo zod KNJIŽNICE
const walletFormSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  startingBlock: z
    .string()
    .regex(/^\d+$/, "Block number must be a positive integer"),
  endingBlock: z.string().optional(),
});

const balanceFormSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  date: z.date(),
});

// Type definition
type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  block: number;
  timestamp: string;
  gas: string;
  gasPrice: string;
  type: "in" | "out";
};

// Type definition for token transfers (ERC-20, ERC-721)
type TokenTransfer = {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenName: string;
  contractAddress: string;
  block: number;
  timestamp: string;
};

// Glavna komponenta za  Ethereum transakcije
// Main component for Ethereum transaction crawling
export default function EthereumCrawler() {
  // Stanja (state) za shranjevanje podatkov in stanja aplikacije
  // State variables for storing data and application state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokenTransfers, setTokenTransfers] = useState<TokenTransfer[]>([]);
  const [historicalBalance, setHistoricalBalance] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [currentWallet, setCurrentWallet] = useState<string>("");
  const [blockRange, setBlockRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const walletForm = useForm<z.infer<typeof walletFormSchema>>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: {
      walletAddress: "",
      startingBlock: "",
      endingBlock: "",
    },
  });

  const balanceForm = useForm<z.infer<typeof balanceFormSchema>>({
    resolver: zodResolver(balanceFormSchema),
    defaultValues: {
      walletAddress: "",
      date: new Date(),
    },
  });

  // Funkcija za obdelavo oddaje obrazca za iskanje transakcij
  // Function to handle wallet transaction search form submission
  const onWalletSubmit = async (values: z.infer<typeof walletFormSchema>) => {
    setLoading(true);
    setCurrentWallet(values.walletAddress);

    try {
      console.log("Fetching transactions for:", values);

      // Pridobivamo ETH transakcije iz Etherscan API-ja
      // Fetch ETH transactions from Etherscan API
      const transactionsResponse = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: values.walletAddress,
          startBlock: values.startingBlock,
          endBlock: values.endingBlock,
        }),
      });

      // Pridobivamo prenose tokenov iz Etherscan API-ja
      // Fetch token transfers from Etherscan API
      const tokensResponse = await fetch("/api/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: values.walletAddress,
          startBlock: values.startingBlock,
          endBlock: values.endingBlock,
        }),
      });

      // Handle transactions response
      if (!transactionsResponse.ok) {
        const errorData = await transactionsResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error || "Failed to fetch transactions from Etherscan API";

        if (errorMessage.includes("rate limit")) {
          alert(
            "⚠️ Rate limit exceeded! Please wait a moment and try again. Etherscan has a limit of 5 requests per second for free accounts."
          );
        } else {
          alert(`Error fetching transactions: ${errorMessage}`);
        }
        setTransactions([]);
      } else {
        const transactionsData = await transactionsResponse.json();
        if (transactionsData.success) {
          setTransactions(transactionsData.transactions || []);
          setBlockRange(transactionsData.blockRange);
        } else {
          console.error("Transactions API error:", transactionsData.error);
          setTransactions([]);
          alert(`Error fetching transactions: ${transactionsData.error}`);
        }
      }

      // Handle tokens response
      if (!tokensResponse.ok) {
        const errorData = await tokensResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          "Failed to fetch token transfers from Etherscan API";

        if (errorMessage.includes("rate limit")) {
          alert(
            "⚠️ Rate limit exceeded! Please wait a moment and try again. Etherscan has a limit of 5 requests per second for free accounts."
          );
        } else {
          alert(`Error fetching token transfers: ${errorMessage}`);
        }
        setTokenTransfers([]);
      } else {
        const tokensData = await tokensResponse.json();
        if (tokensData.success) {
          setTokenTransfers(tokensData.transfers || []);
        } else {
          console.error("Tokens API error:", tokensData.error);
          setTokenTransfers([]);
          alert(`Error fetching token transfers: ${tokensData.error}`);
        }
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      // Set empty arrays on error
      setTransactions([]);
      setTokenTransfers([]);
      setBlockRange(null);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      if (errorMessage.includes("rate limit")) {
        alert(
          "⚠️ Rate limit exceeded! Please wait a moment and try again. Etherscan has a limit of 5 requests per second for free accounts."
        );
      } else {
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Funkcija za obdelavo oddaje obrazca za zgodovinsko stanje
  // Function to handle historical balance form submission
  const onBalanceSubmit = async (values: z.infer<typeof balanceFormSchema>) => {
    setLoading(true);

    try {
      console.log("Fetching historical balance for:", values);

      // Pridobivamo zgodovinsko stanje iz API-ja
      // Fetch historical balance from API
      const balanceResponse = await fetch("/api/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: values.walletAddress,
          date: values.date.toISOString().split("T")[0],
        }),
      });

      if (!balanceResponse.ok) {
        const errorData = await balanceResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          "Failed to fetch historical balance from Etherscan API";

        if (errorMessage.includes("rate limit")) {
          alert(
            "⚠️ Rate limit exceeded! Please wait a moment and try again. Etherscan has a limit of 5 requests per second for free accounts."
          );
        } else {
          alert(`Error fetching historical balance: ${errorMessage}`);
        }
        setHistoricalBalance(null);
      } else {
        const balanceData = await balanceResponse.json();

        if (balanceData.success) {
          setHistoricalBalance(balanceData.balance);
        } else {
          console.error("Balance API error:", balanceData.error);
          setHistoricalBalance(null);
          alert(`Error fetching historical balance: ${balanceData.error}`);
        }
      }
    } catch (error) {
      console.error("Error fetching historical balance:", error);
      setHistoricalBalance(null);
      alert(
        `Error: ${
          error instanceof Error ? error.message : "Unknown error occurred"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-purple-900 p-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-6 py-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-purple-600 bg-clip-text text-transparent flex items-center justify-center gap-4">
            <Wallet className="h-12 w-12 text-purple-500" />
            Ethereum Transaction Crawler
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Analyze Ethereum transactions, track wallet activity, and explore
            blockchain data with{" "}
            <span className="text-purple-400 font-semibold">OriginTrail</span>{" "}
            precision
          </p>
        </div>

        <Tabs defaultValue="crawler" className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto bg-gray-800/50 border border-purple-500/20 backdrop-blur-sm">
            <TabsTrigger
              value="crawler"
              className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-300 hover:text-purple-300 transition-colors"
            >
              <Search className="h-4 w-4" />
              Transaction Crawler
            </TabsTrigger>
            <TabsTrigger
              value="balance"
              className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-300 hover:text-purple-300 transition-colors"
            >
              <Clock className="h-4 w-4" />
              Historical Balance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="crawler" className="space-y-8">
            <Card className="bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
              <CardHeader className="border-b border-purple-500/20">
                <CardTitle className="flex items-center gap-3 text-white">
                  <Search className="h-6 w-6 text-purple-400" />
                  Wallet Transaction Search
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Enter a wallet address and starting block to crawl all
                  transactions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 bg-gray-900/50">
                <Form {...walletForm}>
                  <form
                    onSubmit={walletForm.handleSubmit(onWalletSubmit)}
                    className="space-y-6"
                  >
                    <div className="grid md:grid-cols-3 gap-6">
                      <FormField
                        control={walletForm.control}
                        name="walletAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-purple-300">
                              Wallet Address
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="0x..."
                                {...field}
                                className="bg-gray-700/50 border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-purple-400/20"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={walletForm.control}
                        name="startingBlock"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-purple-300">
                              Starting Block
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="9000000"
                                {...field}
                                className="bg-gray-700/50 border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-purple-400/20"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={walletForm.control}
                        name="endingBlock"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-purple-300">
                              Ending Block (Optional)
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Latest"
                                {...field}
                                className="bg-gray-700/50 border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-purple-400/20"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full md:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-lg shadow-purple-500/25 transition-all duration-300"
                    >
                      {loading ? "Crawling..." : "Start Crawling"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {currentWallet && (
              <div className="space-y-6">
                <Card className="bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
                  <CardHeader className="border-b border-purple-500/20">
                    <CardTitle className="flex items-center gap-3 text-white">
                      <TrendingUp className="h-6 w-6 text-purple-400" />
                      Crawling Results
                    </CardTitle>
                    <CardDescription className="text-gray-300">
                      Results for wallet:{" "}
                      <span className="text-purple-300 font-mono">
                        {currentWallet}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 bg-gray-900/50">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="text-center p-6 bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg backdrop-blur-sm">
                        <div className="text-3xl font-bold text-blue-400">
                          {transactions.length}
                        </div>
                        <div className="text-sm text-gray-300 mt-2">
                          ETH Transactions
                        </div>
                      </div>
                      <div className="text-center p-6 bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                        <div className="text-3xl font-bold text-purple-400">
                          {tokenTransfers.length}
                        </div>
                        <div className="text-sm text-gray-300 mt-2">
                          Token Transfers
                        </div>
                      </div>
                      <div className="text-center p-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-lg backdrop-blur-sm">
                        <div className="text-3xl font-bold text-indigo-400">
                          {blockRange
                            ? `${blockRange.start} - ${blockRange.end}`
                            : "N/A"}
                        </div>
                        <div className="text-sm text-gray-300 mt-2">
                          Block Range
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
                  <CardHeader className="border-b border-purple-500/20">
                    <CardTitle className="text-white">
                      ETH Transactions
                    </CardTitle>
                    <CardDescription className="text-gray-300">
                      All ETH transactions for the specified wallet and block
                      range
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {transactions.length > 0 ? (
                      <Table className="border-separate border-spacing-0">
                        <TableHeader className="bg-gray-900/50">
                          <TableRow className="border-b border-purple-500/20">
                            <TableHead className="text-purple-300 font-semibold">
                              Hash
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Type
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              From
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              To
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Value (ETH)
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Block
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Timestamp
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-gray-800/20">
                          {transactions.map((tx, index) => (
                            <TableRow
                              key={tx.hash}
                              className={`border-b border-gray-700/30 hover:bg-purple-900/20 transition-colors ${
                                index % 2 === 0
                                  ? "bg-gray-900/20"
                                  : "bg-gray-800/20"
                              }`}
                            >
                              <TableCell className="font-mono text-sm text-gray-300">
                                <a
                                  href={`https://etherscan.io/tx/${tx.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                                >
                                  {tx.hash.slice(0, 10)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    tx.type === "in"
                                      ? "bg-green-600/80 text-green-100 hover:bg-green-600"
                                      : "bg-red-600/80 text-red-100 hover:bg-red-600"
                                  }
                                >
                                  {tx.type === "in" ? "Received" : "Sent"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm text-gray-300">
                                {tx.from.slice(0, 10)}...
                              </TableCell>
                              <TableCell className="font-mono text-sm text-gray-300">
                                {tx.to.slice(0, 10)}...
                              </TableCell>
                              <TableCell className="font-bold text-blue-400">
                                {tx.value} ETH
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {tx.block}
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {new Date(tx.timestamp).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        No ETH transactions found for the specified criteria
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tabela prenosov tokenov  */}
                {/* Token Transfers  */}
                <Card className="bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
                  <CardHeader className="border-b border-purple-500/20">
                    <CardTitle className="text-white">
                      Token Transfers
                    </CardTitle>
                    <CardDescription className="text-gray-300">
                      All token transfers for the specified wallet and block
                      range
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {tokenTransfers.length > 0 ? (
                      <Table className="border-separate border-spacing-0">
                        <TableHeader className="bg-gray-900/50">
                          <TableRow className="border-b border-purple-500/20">
                            <TableHead className="text-purple-300 font-semibold">
                              Hash
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Token
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              From
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              To
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Amount
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Block
                            </TableHead>
                            <TableHead className="text-purple-300 font-semibold">
                              Timestamp
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-gray-800/20">
                          {tokenTransfers.map((transfer, index) => (
                            <TableRow
                              key={transfer.hash}
                              className={`border-b border-gray-700/30 hover:bg-purple-900/20 transition-colors ${
                                index % 2 === 0
                                  ? "bg-gray-900/20"
                                  : "bg-gray-800/20"
                              }`}
                            >
                              <TableCell className="font-mono text-sm text-gray-300">
                                <a
                                  href={`https://etherscan.io/tx/${transfer.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                                >
                                  {transfer.hash.slice(0, 10)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                              <TableCell>
                                <Badge className="bg-purple-600/80 text-purple-100 hover:bg-purple-600 border-purple-400/50">
                                  {transfer.tokenSymbol}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm text-gray-300">
                                {transfer.from.slice(0, 10)}...
                              </TableCell>
                              <TableCell className="font-mono text-sm text-gray-300">
                                {transfer.to.slice(0, 10)}...
                              </TableCell>
                              <TableCell className="font-bold text-purple-400">
                                {transfer.value} {transfer.tokenSymbol}
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {transfer.block}
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {new Date(transfer.timestamp).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        No token transfers found for the specified criteria
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Zavihek za zgodovinsko stanje */}
          {/* Historical Balance Tab  */}
          <TabsContent value="balance" className="space-y-8">
            <Card className="bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
              <CardHeader className="border-b border-purple-500/20">
                <CardTitle className="flex items-center gap-3 text-white">
                  <Clock className="h-6 w-6 text-purple-400" />
                  Historical Balance Lookup
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Get the exact ETH balance of a wallet at a specific date and
                  time
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 bg-gray-900/50">
                <Form {...balanceForm}>
                  <form
                    onSubmit={balanceForm.handleSubmit(onBalanceSubmit)}
                    className="space-y-6"
                  >
                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={balanceForm.control}
                        name="walletAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-purple-300">
                              Wallet Address
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="0x..."
                                {...field}
                                className="bg-gray-700/50 border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-purple-400/20"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={balanceForm.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-purple-300">
                              Date (YYYY-MM-DD at 00:00 UTC)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                value={
                                  field.value
                                    ? format(field.value, "yyyy-MM-dd")
                                    : ""
                                }
                                onChange={(e) =>
                                  field.onChange(new Date(e.target.value))
                                }
                                className="bg-gray-700/50 border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-purple-400/20"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full md:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-lg shadow-purple-500/25 transition-all duration-300"
                    >
                      {loading ? "Looking up..." : "Get Historical Balance"}
                    </Button>
                  </form>
                </Form>

                {historicalBalance && (
                  <Card className="mt-8 bg-gray-800/40 border-purple-500/30 backdrop-blur-sm shadow-2xl">
                    <CardHeader className="border-b border-purple-500/20">
                      <CardTitle className="text-white">
                        Historical Balance Result
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 bg-gray-900/50">
                      <div className="text-center p-8 bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                        <div className="text-4xl font-bold text-purple-400 mb-3">
                          {historicalBalance} ETH
                        </div>
                        <div className="text-sm text-gray-300">
                          Balance at{" "}
                          <span className="text-purple-300 font-semibold">
                            {balanceForm.watch("date")
                              ? format(balanceForm.watch("date"), "yyyy-MM-dd")
                              : "selected date"}
                          </span>{" "}
                          00:00 UTC
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
