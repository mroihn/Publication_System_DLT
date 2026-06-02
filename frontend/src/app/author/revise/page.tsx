"use client";

import { useState } from "react";
import { UploadCloud, Edit3, Send } from "lucide-react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";

export default function ReviseManuscriptPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  
  const [manuscriptId, setManuscriptId] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-white">Wallet Not Connected</h2>
          <p className="text-slate-400">Please connect your Web3 wallet to revise a manuscript.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      alert("Revision submitted successfully!");
      router.push("/articles");
    }, 2000);
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <Edit3 className="w-8 h-8 text-indigo-400" />
          <span>Revise Manuscript</span>
        </h1>
        <p className="text-slate-400 mt-2">
          Submit an updated version of your manuscript based on reviewer feedback.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        <div>
          <label htmlFor="manuscriptId" className="block text-sm font-medium text-slate-300 mb-2">
            Manuscript ID
          </label>
          <input
            type="text"
            id="manuscriptId"
            required
            value={manuscriptId}
            onChange={(e) => setManuscriptId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="e.g., 1"
          />
        </div>

        <div>
          <label htmlFor="revisionNotes" className="block text-sm font-medium text-slate-300 mb-2">
            Revision Notes
          </label>
          <textarea
            id="revisionNotes"
            required
            rows={4}
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            placeholder="Describe the changes made in this revision..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Upload Revised PDF Document
          </label>
          <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:bg-slate-800/50 transition-colors cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-slate-500 mx-auto mb-4 group-hover:text-indigo-400 transition-colors" />
            <p className="text-slate-300 font-medium">Drag & drop your revised PDF here</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-medium transition-all"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span>{isSubmitting ? "Submitting..." : "Submit Revision"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
