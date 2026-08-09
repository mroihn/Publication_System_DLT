"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, MessageSquare } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";

export default function SubmitReviewPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [manuscriptId, setManuscriptId] = useState("");
  const [verdict, setVerdict] = useState("0");
  const [critique, setCritique] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.push("/login"); return; }
    if (user?.role !== "reviewer") { router.push("/profile"); return; }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "reviewer") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.post(`/manuscripts/${manuscriptId}/reviews`, {
        verdict: Number(verdict),
        comments: critique,
      });
      addToast("Review submitted successfully!", "success");
      router.push("/articles");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to submit review. Please try again.";
      addToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <CheckCircle className="w-8 h-8 text-indigo-400" />
          <span>Submit Review</span>
        </h1>
        <p className="text-slate-400 mt-2">
          Provide your verdict and textual critique for the assigned manuscript.
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
          <label htmlFor="verdict" className="block text-sm font-medium text-slate-300 mb-2">
            Verdict
          </label>
          <select
            id="verdict"
            required
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="0">Accept</option>
            <option value="2">Revise</option>
            <option value="1">Reject</option>
          </select>
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
