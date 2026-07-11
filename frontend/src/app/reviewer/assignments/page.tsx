"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";

interface Assignment {
  ms_id: number;
  status: string;
  metadata: string;
  cid: string;
  reviewed: boolean;
}

function parseTitle(metadata: string): string {
  try {
    return JSON.parse(metadata).title || `Manuscript #`;
  } catch {
    return "Untitled";
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CHECKING: "bg-amber-100 text-amber-800",
    PENDING_EDITOR: "bg-purple-100 text-purple-800",
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

export default function ReviewerAssignmentsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return apiClient
      .get<{ data: Assignment[] }>("/reviewer/assignments")
      .then((res) => {
        const seen = new Set<number>();
        const unique = res.data.data.filter((a) => {
          if (seen.has(a.ms_id)) return false;
          seen.add(a.ms_id);
          return true;
        });
        setAssignments(unique);
      });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (user?.role !== "reviewer") {
      router.push("/profile");
      return;
    }
    load()
      .catch(() => addToast("Failed to load your assignments.", "error"))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, user, router, load, addToast]);

  if (isLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const toReview = assignments.filter((a) => a.status === "UNDER_REVIEW" && !a.reviewed);
  const done = assignments.filter((a) => !(a.status === "UNDER_REVIEW" && !a.reviewed));

  const card = (a: Assignment) => (
    <div
      key={a.ms_id}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-wrap items-center gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-indigo-600" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">
          #{a.ms_id} — {parseTitle(a.metadata)}
        </p>
        <a
          href={`https://ipfs.io/ipfs/${a.cid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          view file <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <StatusBadge status={a.status} />
        {a.reviewed ? (
          <span className="inline-flex items-center gap-1 text-sm text-green-700 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Reviewed
          </span>
        ) : a.status === "UNDER_REVIEW" ? (
          <Link
            href={`/review/${a.ms_id}`}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Review
          </Link>
        ) : (
          <span className="text-xs text-gray-400">not open</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-indigo-600" />
          My Review Assignments
        </h1>
        <p className="text-gray-500 mt-2">
          Manuscripts assigned to you as an anonymous reviewer. Sign your verdict for each with your
          one-time reviewer wallet.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Needs your review ({toReview.length})
        </h2>
        {toReview.length > 0 ? (
          toReview.map(card)
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500">
            Nothing waiting on you right now.
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Reviewed / closed ({done.length})
          </h2>
          {done.map(card)}
        </section>
      )}

      {assignments.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center text-gray-500">
          You have no review assignments yet. An editor assigns reviewers by field once your
          specialization is verified.
        </div>
      )}
    </div>
  );
}
