"use client";

import { useState } from "react";
import { CheckCircle, MessageSquare } from "lucide-react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";

export default function SubmitReviewPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  
  const [manuscriptId, setManuscriptId] = useState("");
  const [score, setScore] = useState(5);
  const [critique, setCritique] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-white">Wallet Not Connected</h2>
          <p className="text-slate-400">Please connect your Web3 wallet to submit a review.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      alert("Review submitted successfully!");
      router.push("/articles");
    }, 2000);
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <CheckCircle className="w-8 h-8 text-indigo-400" />
          <span>Submit Review</span>
        </h1>
        <p className="text-slate-400 mt-2">
          Provide your score and textual critique for the assigned manuscript.
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
            placeholder="e.g., 42"
          />
        </div>

        <div>
          <label htmlFor="score" className="block text-sm font-medium text-slate-300 mb-2">
            Score (1-10)
          </label>
          <input
            type="number"
            id="score"
            required
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        <div>
          <label htmlFor="critique" className="block text-sm font-medium text-slate-300 mb-2">
            Detailed Critique
          </label>
          <textarea
            id="critique"
            required
            rows={6}
            value={critique}
            onChange={(e) => setCritique(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            placeholder="Provide constructive feedback, methodologies review, and conclusions..."
          />
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
              <MessageSquare className="w-5 h-5" />
            )}
            <span>{isSubmitting ? "Submitting..." : "Submit Review"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
