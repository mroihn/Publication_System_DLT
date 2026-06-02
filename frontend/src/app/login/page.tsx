"use client";

import { useAccount, useConnect } from "wagmi";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Wallet } from "lucide-react";

export default function LoginPage() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const router = useRouter();

  useEffect(() => {
    if (isConnected) {
      router.push("/author/submit");
    }
  }, [isConnected, router]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-700">
            <ShieldCheck className="w-10 h-10 text-indigo-400" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-slate-400 mb-8">
            Connect your Web3 wallet to access the decentralized publishing platform.
          </p>
          
          <button
            onClick={() => connect({ connector: connectors[0] })}
            className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-indigo-600/25"
          >
            <Wallet className="w-5 h-5" />
            <span>Connect with MetaMask</span>
          </button>
          
          <div className="mt-8 text-sm text-slate-500">
            By connecting, you agree to our Terms of Service and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
}
