"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Activity,
  User,
  FileText,
  Tag,
} from "lucide-react";
import { apiClient } from "@/core/services/api.client";
import { OpenReviewPanel, type Identity } from "@/components/OpenReviewPanel";
import { Comments } from "@/components/Comments";

interface ManuscriptDetail {
  ms_id: number;
  cid: string;
  metadata: string;
  status: string;
  version: number;
  author_address: string;
  field: string | null;
  doi: string | null;
  doi_token_id: number | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  ai: "AI",
  "computer-security": "Computer Security",
  blockchain: "Blockchain",
  "cloud-computing": "Cloud Computing",
  "data-science": "Data Science",
};

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

function parseMeta(metadata: string): { title: string; abstract: string } {
  try {
    const m = JSON.parse(metadata);
    return { title: m.title || "Untitled", abstract: m.abstract || "" };
  } catch {
    return { title: "Untitled", abstract: "" };
  }
}

export default function ArticleDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [ms, setMs] = useState<ManuscriptDetail | null>(null);
  const [author, setAuthor] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient
      .get<ManuscriptDetail>(`/manuscripts/${id}`)
      .then((res) => { setMs(res.data); setError(null); })
      .catch((err: { response?: { status?: number } }) =>
        setError(err.response?.status === 404 ? "Manuscript not found." : "Failed to load manuscript.")
      )
      .finally(() => setLoading(false));
  }, [id]);

  const handleAuthor = useCallback((a: Identity) => setAuthor(a), []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }
  if (error || !ms) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center">
        <p className="text-red-600 font-medium mb-4">{error ?? "Unknown error."}</p>
        <Link href="/articles" className="text-indigo-600 hover:underline text-sm">← Back to articles</Link>
      </div>
    );
  }

  const meta = parseMeta(ms.metadata);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/articles" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to articles
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-xs text-gray-400 font-mono">#{ms.ms_id}</span>
              <StatusBadge status={ms.status} />
              {ms.version > 1 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">v{ms.version}</span>
              )}
              {ms.field && (
                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  <Tag className="w-3 h-3" /> {FIELD_LABELS[ms.field] ?? ms.field}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-extrabold text-gray-900 mb-3">{meta.title}</h1>

            <div className="flex items-start gap-2 text-sm text-gray-600 mb-5">
              <User className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="font-mono text-gray-800 break-all">{author?.real_wallet || ms.author_address}</span>
            </div>

            {meta.abstract && <p className="text-gray-700 leading-relaxed mb-6">{meta.abstract}</p>}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm border-t border-gray-100 pt-5">
              <div>
                <dt className="text-gray-400 font-medium">Manuscript file</dt>
                <dd>
                  <a href={`https://ipfs.io/ipfs/${ms.cid}`} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-mono text-xs">
                    <FileText className="w-3.5 h-3.5" /> {ms.cid.slice(0, 20)}… <ExternalLink className="w-3 h-3" />
                  </a>
                </dd>
              </div>
              {ms.doi && (
                <div>
                  <dt className="text-gray-400 font-medium">DOI</dt>
                  <dd className="font-mono text-xs text-gray-700">{ms.doi}</dd>
                </div>
              )}
              {ms.doi_token_id !== null && (
                <div>
                  <dt className="text-gray-400 font-medium">DOI NFT</dt>
                  <dd className="font-mono text-xs text-gray-700">#{ms.doi_token_id}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6">
              <Link
                href={`/tracker/${ms.ms_id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Activity className="w-4 h-4" /> View Tracker
              </Link>
            </div>
          </div>

          <Comments msId={ms.ms_id} doiTokenId={ms.doi_token_id} status={ms.status} />
        </div>

        <div className="lg:col-span-1">
          <OpenReviewPanel msId={ms.ms_id} onAuthor={handleAuthor} />
        </div>
      </div>
    </div>
  );
}
