"use client";

import { useEffect, useState } from "react";
import {
  ScrollText,
  Loader2,
  ExternalLink,
  CircleDot,
} from "lucide-react";
import { apiClient } from "@/core/services/api.client";

interface Identity {
  address: string;
  email: string;
  real_wallet: string;
}

interface Report {
  reviewer: Identity;
  status: string; // pending | ACCEPT | REJECT | REVISE
  review_cid?: string | null;
  tx_hash?: string;
}

interface Version {
  version: number;
  date: string | null;
  reports: Report[];
}

interface OpenReview {
  ms_id: number;
  status: string;
  author: Identity;
  versions: Version[];
  reviewers: Identity[];
}

export type { Identity };

const STATUS: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  pending: { label: "Pending", dot: "bg-gray-400", text: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
  submitted: { label: "Submitted", dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  ACCEPT: { label: "Accepted", dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50 border-green-200" },
  REJECT: { label: "Rejected", dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50 border-red-200" },
  REVISE: { label: "Revision", dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
};
const st = (s: string) => STATUS[s] ?? STATUS.pending;

function name(id: Identity): string {
  if (id.email) return id.email;
  const a = id.real_wallet || id.address;
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

export function OpenReviewPanel({
  msId,
  onAuthor,
}: {
  msId: string | number;
  onAuthor?: (author: Identity) => void;
}) {
  const [data, setData] = useState<OpenReview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<OpenReview>(`/manuscripts/${msId}/open-review`)
      .then((res) => {
        setData(res.data);
        if (res.data.author) onAuthor?.(res.data.author);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [msId, onAuthor]);

  const latest = data?.versions?.[data.versions.length - 1];

  return (
    <aside className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">Open Peer Review</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : !data || data.reviewers.length === 0 ? (
        <p className="text-sm text-gray-500">No reviewers have been assigned yet.</p>
      ) : (
        <>
          {/* Reviewer status */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reviewer Status</h3>
            <div className="flex flex-wrap gap-2">
              {(latest?.reports ?? []).map((r, i) => {
                const s = st(r.status);
                return (
                  <span
                    key={i}
                    title={`${name(r.reviewer)} — ${s.label}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.bg} ${s.text}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {name(r.reviewer)}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-gray-500">
              {Object.values(STATUS).map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                </span>
              ))}
            </div>
          </section>

          {/* Reports by version */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reviewer Reports</h3>
            {data.versions
              .slice()
              .reverse()
              .map((v) => (
                <div key={v.version} className="border border-gray-100 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Version {v.version}</span>
                    <span className="text-xs text-gray-400">
                      {v.date ? new Date(v.date).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {v.reports.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">No reviewers recorded for this version.</p>
                    ) : (
                      v.reports.map((r, i) => {
                        const s = st(r.status);
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                              <span className="text-sm text-gray-700 truncate">{name(r.reviewer)}</span>
                            </span>
                            {r.review_cid ? (
                              <a
                                href={`https://ipfs.io/ipfs/${r.review_cid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                              >
                                Read <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 flex-shrink-0">Pending</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
          </section>

          {/* Reviewer identities */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reviewers</h3>
            <ul className="space-y-2">
              {data.reviewers.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CircleDot className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-800 truncate">{r.email || "Unregistered reviewer"}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{r.real_wallet || r.address}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}
