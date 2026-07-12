"use client";

import { useEffect, useState } from "react";
import { ScrollText, Loader2, Info } from "lucide-react";
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

const columnKey = (id: Identity) => (id.real_wallet || id.address || "").toLowerCase();

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

const STATUS_LEGEND = "? Not yet submitted   ✓ Approved   ✗ Rejected   ↻ Revision requested";

function reviewerMark(rep: Report | undefined): { symbol: string; className: string; label: string } {
  if (!rep || rep.status === "pending") {
    return { symbol: "?", className: "text-gray-400", label: "Not yet submitted" };
  }
  if (rep.status === "ACCEPT") {
    return { symbol: "✓", className: "text-green-600", label: "Approved" };
  }
  if (rep.status === "REJECT") {
    return { symbol: "✗", className: "text-red-600", label: "Rejected" };
  }
  return { symbol: "↻", className: "text-amber-600", label: "Revision requested" };
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

  const columns = data?.reviewers ?? [];
  const latestVersion = data?.versions[data.versions.length - 1];
  const latestByKey = new Map((latestVersion?.reports ?? []).map((rep) => [columnKey(rep.reviewer), rep]));

  return (
    <aside className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <ScrollText className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">Open Peer Review</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : !data || columns.length === 0 ? (
        <p className="px-6 py-6 text-sm text-gray-500">No reviewers have been assigned yet.</p>
      ) : (
        <>
          <section className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Reviewer Status</h3>
            <div className="flex items-center gap-3">
              {columns.map((r) => {
                const mark = reviewerMark(latestByKey.get(columnKey(r)));
                return (
                  <span
                    key={columnKey(r)}
                    title={mark.label}
                    className={`font-bold text-lg leading-none ${mark.className}`}
                  >
                    {mark.symbol}
                  </span>
                );
              })}
            </div>
            <span className="ml-auto text-gray-400" title={STATUS_LEGEND}>
              <Info className="w-5 h-5" />
            </span>
          </section>

          <section className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Reviewer Reports</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-px" />
                    <th
                      colSpan={columns.length}
                      className="pb-1 text-center text-sm font-medium italic text-gray-500"
                    >
                      Invited Reviewers
                    </th>
                  </tr>
                  <tr className="text-gray-500">
                    <th className="w-px" />
                    {columns.map((r, i) => (
                      <th
                        key={columnKey(r)}
                        className={`px-3 py-1 text-center font-medium ${i > 0 ? "border-l border-gray-100" : ""}`}
                      >
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.versions
                    .slice()
                    .reverse()
                    .map((v) => {
                      const byKey = new Map(v.reports.map((rep) => [columnKey(rep.reviewer), rep]));
                      return (
                        <tr key={v.version} className="border-t border-gray-100 align-top">
                          <td className="py-3 pr-4 whitespace-nowrap">
                            <div className="font-semibold text-indigo-600">Version {v.version}</div>
                            {v.version > 1 && <div className="text-xs text-gray-500">(revision)</div>}
                            <div className="text-xs text-gray-500">{formatDate(v.date)}</div>
                          </td>
                          {columns.map((r, i) => {
                            const rep = byKey.get(columnKey(r));
                            const mark = reviewerMark(rep);
                            return (
                              <td
                                key={columnKey(r)}
                                className={`px-3 py-3 text-center ${i > 0 ? "border-l border-gray-100" : ""}`}
                              >
                                {rep ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span
                                      title={mark.label}
                                      className={`font-bold text-lg leading-none ${mark.className}`}
                                    >
                                      {mark.symbol}
                                    </span>
                                    {rep.status !== "pending" && (
                                      rep.review_cid ? (
                                        <a
                                          href={`https://ipfs.io/ipfs/${rep.review_cid}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                                        >
                                          read
                                        </a>
                                      ) : (
                                        <span className="text-xs text-gray-300">read</span>
                                      )
                                    )}
                                  </div>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="px-6 py-4">
            <ol className="space-y-3">
              {columns.map((r, i) => (
                <li key={columnKey(r)} className="flex gap-2 text-sm">
                  <span className="text-gray-500 font-medium">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{r.email || "Unregistered reviewer"}</p>
                    <p className="text-xs text-gray-400 font-mono break-all">{r.real_wallet || r.address}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </aside>
  );
}
