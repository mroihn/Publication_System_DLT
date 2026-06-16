"use client";

import { useEffect, useState } from "react";
import { FileText, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/core/services/api.client";
import { ManuscriptStepper } from "@/components/ManuscriptStepper";

interface ManuscriptSummary {
  ms_id: number;
  cid: string;
  status: string;
  version: number;
  author_address: string;
  plagiarism_score: number | null;
  submit_tx_hash: string;
  submit_block: number;
  created_at: string;
  updated_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CHECKING: "bg-amber-100 text-amber-800",
    UNDER_REVIEW: "bg-blue-100 text-blue-800",
    REVISION_REQUESTED: "bg-orange-100 text-orange-800",
    ACCEPTED: "bg-green-100 text-green-800",
    PUBLISHED: "bg-indigo-100 text-indigo-800",
    REJECTED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function StatusTrackerPage() {
  const [manuscripts, setManuscripts] = useState<ManuscriptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: ManuscriptSummary[] }>("/manuscripts")
      .then((res) => setManuscripts(res.data.data))
      .catch(() => setError("Failed to load manuscripts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
          Manuscript Status Tracker
        </h1>
        <p className="text-gray-600 text-lg mb-4">
          Track the real-time publication progress of your submissions on the decentralized network.
        </p>
        <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>All submissions are recorded on Ethereum Sepolia. Transaction hashes link to the public block explorer for independent verification.</span>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      )}

      {error && (
        <div className="text-center py-20">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={load}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && manuscripts.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          No manuscripts found.
        </div>
      )}

      {!loading && !error && manuscripts.length > 0 && (
        <div className="space-y-8">
          {manuscripts.map((ms) => (
            <div key={ms.ms_id} className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold text-gray-900">Manuscript #{ms.ms_id}</h2>
                    <StatusBadge status={ms.status} />
                  </div>
                  <p className="text-sm text-gray-500 font-mono">
                    CID: {ms.cid.slice(0, 16)}…
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Submitted {new Date(ms.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/tracker/${ms.ms_id}`}
                  className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 font-medium transition-colors bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Details</span>
                </Link>
              </div>

              <ManuscriptStepper status={ms.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
