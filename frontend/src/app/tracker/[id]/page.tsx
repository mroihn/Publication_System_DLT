"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Users,
  ShieldCheck,
  GitCommit,
} from "lucide-react";
import { apiClient } from "@/core/services/api.client";
import { ManuscriptStepper } from "@/components/ManuscriptStepper";

interface Reviewer {
  reviewer_address: string;
  assigned_at: string;
}

interface Review {
  reviewer_address: string;
  verdict: string;
  tx_hash: string;
  block_number: number;
  submitted_at: string;
}

interface Revision {
  new_cid: string;
  version: number;
  tx_hash: string;
  block_number: number;
  revised_at: string;
}

interface PlagiarismRequest {
  request_id: number;
  score: number | null;
  fulfilled: boolean;
  requested_at: string;
  fulfilled_at: string | null;
}

interface ProcessedEvent {
  event_name: string;
  tx_hash: string;
  block_number: number;
  log_index: number;
  contract_addr: string;
  processed_at: string;
}

interface ManuscriptDetail {
  ms_id: number;
  cid: string;
  metadata: string;
  status: string;
  version: number;
  author_address: string;
  plagiarism_score: number | null;
  doi: string | null;
  doi_token_id: number | null;
  accept_count: number;
  reject_count: number;
  revise_count: number;
  submit_tx_hash: string;
  submit_block: number;
  created_at: string;
  updated_at: string;
  reviewers: Reviewer[];
  reviews: Review[];
  revisions: Revision[];
  plagiarism_requests: PlagiarismRequest[];
  events: ProcessedEvent[];
}

const EXPLORER = "https://sepolia.etherscan.io";

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

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    ACCEPT: "bg-green-100 text-green-800",
    REJECT: "bg-red-100 text-red-800",
    REVISE: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[verdict] ?? "bg-gray-100 text-gray-700"}`}>
      {verdict}
    </span>
  );
}

function TxLink({ hash }: { hash: string }) {
  if (!hash) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-mono"
    >
      {hash.slice(0, 10)}…
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function truncateAddr(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

interface TimelineEvent {
  label: string;
  time: string;
  txHash?: string;
  icon: React.ReactNode;
}

function buildTimeline(ms: ManuscriptDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    label: `Manuscript #${ms.ms_id} submitted`,
    time: ms.created_at,
    txHash: ms.submit_tx_hash,
    icon: <FileText className="w-4 h-4" />,
  });

  for (const pr of ms.plagiarism_requests) {
    events.push({
      label: "Plagiarism check started",
      time: pr.requested_at,
      icon: <ShieldCheck className="w-4 h-4" />,
    });
    if (pr.fulfilled && pr.fulfilled_at) {
      events.push({
        label: `Plagiarism check completed — score: ${pr.score ?? "?"}%`,
        time: pr.fulfilled_at,
        icon: pr.score !== null && pr.score <= 30
          ? <CheckCircle2 className="w-4 h-4 text-green-600" />
          : <XCircle className="w-4 h-4 text-red-600" />,
      });
    }
  }

  if (ms.reviewers.length > 0) {
    events.push({
      label: `${ms.reviewers.length} reviewer${ms.reviewers.length > 1 ? "s" : ""} assigned`,
      time: ms.reviewers[0].assigned_at,
      icon: <Users className="w-4 h-4" />,
    });
  }

  for (const rev of ms.reviews) {
    events.push({
      label: `Review submitted by ${truncateAddr(rev.reviewer_address)} — ${rev.verdict}`,
      time: rev.submitted_at,
      txHash: rev.tx_hash,
      icon: <CheckCircle2 className="w-4 h-4" />,
    });
  }

  for (const revision of ms.revisions) {
    events.push({
      label: `Revision v${revision.version} submitted`,
      time: revision.revised_at,
      txHash: revision.tx_hash,
      icon: <GitCommit className="w-4 h-4" />,
    });
  }

  if (ms.doi) {
    events.push({
      label: `Published — DOI assigned: ${ms.doi}`,
      time: ms.updated_at,
      icon: <CheckCircle2 className="w-4 h-4 text-indigo-600" />,
    });
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return events;
}

export default function ManuscriptDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [ms, setMs] = useState<ManuscriptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // All setState calls are inside async callbacks to avoid the
    // react-hooks/set-state-in-effect rule (synchronous setState in effects
    // triggers cascading renders). loading is true from useState(true).
    apiClient
      .get<ManuscriptDetail>(`/manuscripts/${id}`)
      .then((res) => { setMs(res.data); setError(null); })
      .catch((err: { response?: { status?: number } }) => {
        setError(err.response?.status === 404
          ? "Manuscript not found."
          : "Failed to load manuscript.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !ms) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-red-600 font-medium mb-4">{error ?? "Unknown error."}</p>
        <Link href="/tracker" className="text-indigo-600 hover:underline text-sm">
          ← Back to tracker
        </Link>
      </div>
    );
  }

  const timeline = buildTimeline(ms);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-8">

      {/* Back link */}
      <Link href="/tracker" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to tracker
      </Link>

      {/* Transparency banner */}
      <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>All events below are sourced from on-chain data. Transaction hashes can be independently verified on the Ethereum Sepolia block explorer.</span>
      </div>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h1 className="text-2xl font-extrabold text-gray-900">Manuscript #{ms.ms_id}</h1>
          <StatusBadge status={ms.status} />
          {ms.version > 1 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              v{ms.version}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-400 font-medium">IPFS CID</dt>
            <dd>
              <a
                href={`https://ipfs.io/ipfs/${ms.cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-mono text-xs"
              >
                {ms.cid.slice(0, 20)}…
                <ExternalLink className="w-3 h-3" />
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 font-medium">Author address</dt>
            <dd className="font-mono text-xs text-gray-700">{ms.author_address || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-400 font-medium">Submission tx</dt>
            <dd><TxLink hash={ms.submit_tx_hash} /></dd>
          </div>
          <div>
            <dt className="text-gray-400 font-medium">Block number</dt>
            <dd className="text-gray-700">{ms.submit_block || "—"}</dd>
          </div>
          {ms.doi && (
            <div className="col-span-2">
              <dt className="text-gray-400 font-medium">DOI</dt>
              <dd className="text-gray-700 font-mono text-xs">{ms.doi}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-400 font-medium">Submitted</dt>
            <dd className="text-gray-700">{fmt(ms.created_at)}</dd>
          </div>
          <div>
            <dt className="text-gray-400 font-medium">Last updated</dt>
            <dd className="text-gray-700">{fmt(ms.updated_at)}</dd>
          </div>
        </dl>
      </div>

      {/* Progress stepper */}
      <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Publication Progress</h2>
        <ManuscriptStepper status={ms.status} />
      </div>

      {/* Plagiarism check */}
      {ms.plagiarism_requests.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Plagiarism Check</h2>
          {ms.plagiarism_requests.map((pr) => (
            <div key={pr.request_id} className="flex items-center gap-4">
              {pr.fulfilled ? (
                pr.score !== null && pr.score <= 30 ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                )
              ) : (
                <Clock className="w-6 h-6 text-amber-500 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium text-gray-900">
                  {pr.fulfilled
                    ? `Score: ${pr.score ?? "?"}% — ${pr.score !== null && pr.score <= 30 ? "Passed" : "Failed"} (threshold ≤ 30%)`
                    : "Pending result"}
                </p>
                <p className="text-xs text-gray-400">
                  Requested {fmt(pr.requested_at)}
                  {pr.fulfilled_at ? ` · Completed ${fmt(pr.fulfilled_at)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reviewers */}
      {ms.reviewers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Assigned Reviewers</h2>
          <ul className="space-y-2">
            {ms.reviewers.map((rv) => (
              <li key={rv.reviewer_address} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700">{rv.reviewer_address}</span>
                <span className="text-xs text-gray-400">{fmt(rv.assigned_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Review verdicts */}
      {ms.reviews.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Review Verdicts</h2>
          <div className="flex gap-6 mb-4 text-sm text-gray-600">
            <span><span className="font-bold text-green-700">{ms.accept_count}</span> Accept</span>
            <span><span className="font-bold text-red-700">{ms.reject_count}</span> Reject</span>
            <span><span className="font-bold text-amber-700">{ms.revise_count}</span> Revise</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Reviewer</th>
                  <th className="pb-2 font-medium">Verdict</th>
                  <th className="pb-2 font-medium">Block</th>
                  <th className="pb-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ms.reviews.map((rv, i) => (
                  <tr key={i} className="py-2">
                    <td className="py-2 font-mono text-xs text-gray-700">{truncateAddr(rv.reviewer_address)}</td>
                    <td className="py-2"><VerdictBadge verdict={rv.verdict} /></td>
                    <td className="py-2 text-gray-500">{rv.block_number || "—"}</td>
                    <td className="py-2"><TxLink hash={rv.tx_hash} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revision history */}
      {ms.revisions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Revision History</h2>
          <ul className="space-y-3">
            {ms.revisions.map((rev) => (
              <li key={rev.version} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">Version {rev.version}</span>
                  <span className="ml-3 font-mono text-xs text-gray-500">{rev.new_cid.slice(0, 16)}…</span>
                </div>
                <TxLink hash={rev.tx_hash} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Blockchain event timeline */}
      <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Blockchain Event Timeline</h2>
        {ms.events.length > 0 ? (
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-indigo-100" />
            <ul className="space-y-6">
              {ms.events.map((ev, i) => (
                <li key={i} className="relative flex gap-4">
                  <div className="absolute -left-4 top-0.5 w-4 h-4 rounded-full bg-indigo-600 ring-4 ring-white" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {ev.event_name.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Block {ev.block_number} · {fmt(ev.processed_at)}
                    </p>
                    {ev.tx_hash && (
                      <div className="mt-1">
                        <TxLink hash={ev.tx_hash} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-indigo-100" />
            <ul className="space-y-6">
              {timeline.map((ev, i) => (
                <li key={i} className="relative flex gap-4">
                  <div className="absolute -left-4 top-0.5 w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-white ring-4 ring-white">
                    <span className="scale-75">{ev.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ev.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(ev.time)}</p>
                    {ev.txHash && (
                      <div className="mt-1">
                        <TxLink hash={ev.txHash} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
}
