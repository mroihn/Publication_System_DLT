"use client";

import { useState } from "react";
import { UploadCloud, FileText, Send } from "lucide-react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";

export default function SubmitManuscriptPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if not connected
  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-white">Wallet Not Connected</h2>
          <p className="text-slate-400">Please connect your Web3 wallet to submit a manuscript.</p>
          <button 
            onClick={() => router.push("/login")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate IPFS upload and Contract interaction
    setTimeout(() => {
      setIsSubmitting(false);
      alert("Manuscript submitted successfully to the smart contract!");
      router.push("/articles");
    }, 2000);
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <FileText className="w-8 h-8 text-indigo-400" />
          <span>Submit Manuscript</span>
        </h1>
        <p className="text-slate-400 mt-2">
          Upload your academic work to the decentralized network and initiate the peer review process.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-2">
            Manuscript Title
          </label>
          <input
            type="text"
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            placeholder="e.g., A Novel Approach to Quantum Computing"
          />
        </div>

        <div>
          <label htmlFor="abstract" className="block text-sm font-medium text-slate-300 mb-2">
            Abstract
          </label>
          <textarea
            id="abstract"
            required
            rows={5}
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
            placeholder="Provide a concise summary of your research..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Upload PDF Document
          </label>
          <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:bg-slate-800/50 transition-colors cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-slate-500 mx-auto mb-4 group-hover:text-indigo-400 transition-colors" />
            <p className="text-slate-300 font-medium">Drag & drop your PDF here</p>
            <p className="text-slate-500 text-sm mt-1">or click to browse from your computer</p>
            <input type="file" accept=".pdf" className="hidden" />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-medium transition-all"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span>{isSubmitting ? "Submitting..." : "Submit to Network"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
