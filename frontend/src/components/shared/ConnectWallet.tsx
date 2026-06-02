"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-full font-medium transition-colors border border-slate-700"
      >
        <Wallet className="w-4 h-4 text-indigo-400" />
        <span>
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full font-medium transition-colors shadow-lg shadow-indigo-500/20"
    >
      <Wallet className="w-4 h-4" />
      <span>Connect Wallet</span>
    </button>
  );
}
