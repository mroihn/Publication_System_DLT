"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/core/services/api.client";
import { getNonce, signTypedDataWith } from "@/core/services/wallet";
import { useAuth } from "@/core/context/AuthContext";

interface ReviewerAssignment {
  ms_id: number;
  status: string;
  session_address: string;
  session_privkey: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Review {
  reviewer_address: string;
  verdict: string;
  tx_hash: string;
  block_number: number;
  submitted_at: string;
}

interface ManuscriptDetail {
  ms_id: number;
  cid: string;
  status: string;
  version: number;
  author_address: string;
  plagiarism_score: number | null;
  submit_tx_hash: string;
  submit_block: number;
  accept_count: number;
  reject_count: number;
  revise_count: number;
  created_at: string;
  updated_at: string;
  reviewers: { reviewer_address: string; assigned_at: string }[];
  reviews: Review[];
}

const VERDICT_OPTIONS = [
  {
    value: 0,
    label: "Accept",
    description: "The manuscript is ready for publication as-is.",
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: "border-green-300 bg-green-50 text-green-800",
    activeColor: "border-green-500 bg-green-100 ring-2 ring-green-400",
    iconColor: "text-green-600",
  },
  {
    value: 2,
    label: "Revise",
    description: "The manuscript requires revisions before acceptance.",
    icon: <RotateCcw className="w-5 h-5" />,
    color: "border-amber-300 bg-amber-50 text-amber-800",
    activeColor: "border-amber-500 bg-amber-100 ring-2 ring-amber-400",
    iconColor: "text-amber-600",
  },
  {
    value: 1,
    label: "Reject",
    description: "The manuscript does not meet the publication criteria.",
    icon: <XCircle className="w-5 h-5" />,
    color: "border-red-300 bg-red-50 text-red-800",
    activeColor: "border-red-500 bg-red-100 ring-2 ring-red-400",
    iconColor: "text-red-600",
  },
] as const;

const EXPLORER = "https://sepolia.etherscan.io";

// ─── Shared sub-components ───────────────────────────────────────────────────

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
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/_/g, " ")}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReviewManuscriptPage() {
  const params = useParams();
  const msId = params?.msId as string;
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Manuscript fetch
  const [ms, setMs] = useState<ManuscriptDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMs, setLoadingMs] = useState(true);

  // Form state
  const [verdict, setVerdict] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [signing, setSigning] = useState(false);

  // Pending / confirmed state
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [indexed, setIndexed] = useState(false);
  const reviewCountAtSubmit = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMs = useCallback(() => {
    return apiClient
      .get<ManuscriptDetail>(`/manuscripts/${msId}`)
      .then((res) => res.data);
  }, [msId]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.push("/login"); return; }
    if (user?.role !== "reviewer") { router.push("/profile"); return; }
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => {
    if (!msId || isLoading || !isAuthenticated || user?.role !== "reviewer") return;
    fetchMs()
      .then((data) => setMs(data))
      .catch(() => setLoadError("Failed to load manuscript."))
      .finally(() => setLoadingMs(false));
  }, [fetchMs, msId, isLoading, isAuthenticated, user]);

  // Poll until the new review appears in the DB
  const startPolling = useCallback(
    (expectedCountAfter: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const data = await fetchMs();
          setMs(data);
          if (data.reviews.length >= expectedCountAfter) {
            setIndexed(true);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // transient error — keep polling
        }
      }, 3000);
    },
    [fetchMs]
  );

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verdict === null) return;
    setSubmitting(true);
    setSubmitError(null);

    reviewCountAtSubmit.current = ms?.reviews.length ?? 0;

    try {
      // Fetch this reviewer's anonymous session wallet for this manuscript and sign
      // with it — the author never learns the reviewer's real identity. No MetaMask.
      setSigning(true);
      const assignments = await apiClient.get<{ data: ReviewerAssignment[] }>(
        "/reviewer/assignments"
      );
      const session = assignments.data.data.find((s) => s.ms_id === Number(msId));
      if (!session) {
        throw new Error("No anonymous reviewer wallet is assigned to you for this manuscript.");
      }

      const nonce = await getNonce(session.session_address as `0x${string}`);
      const signature = await signTypedDataWith(
        session.session_privkey as `0x${string}`,
        {
          SubmitReview: [
            { name: "msId", type: "uint256" },
            { name: "comments", type: "string" },
            { name: "verdict", type: "uint8" },
            { name: "nonce", type: "uint256" },
          ],
        },
        "SubmitReview",
        { msId: BigInt(msId), comments, verdict: verdict as number, nonce },
      );
      setSigning(false);

      const res = await apiClient.post<{ tx_hash: string }>(
        `/manuscripts/${msId}/reviews`,
        { verdict, comments, signature, nonce: nonce.toString() }
      );
      setPendingTxHash(res.data.tx_hash);
      startPolling(reviewCountAtSubmit.current + 1);
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Submission failed. Please try again.";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setSubmitError("Signature cancelled.");
      } else {
        setSubmitError(msg);
      }
      setSigning(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading || !isAuthenticated || user?.role !== "reviewer" || loadingMs) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (loadError || !ms) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <p className="text-red-600 font-medium mb-4">
          {loadError ?? "Manuscript not found."}
        </p>
        <Link href="/tracker" className="text-indigo-600 hover:underline text-sm">
          ← Back to tracker
        </Link>
      </div>
    );
  }

  const notUnderReview = ms.status !== "UNDER_REVIEW";

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-8">

      {/* Back */}
      <Link
        href={`/tracker/${msId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to manuscript
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Submit Review
        </h1>
        <p className="mt-1 text-gray-500 text-sm">
          Your verdict will be submitted to the blockchain via the platform relayer.
        </p>
      </div>

      {/* Manuscript context card */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 leading-tight">
              Manuscript #{ms.ms_id}
            </h2>
            <p className="text-xs text-gray-400">Version {ms.version}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={ms.status} />
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Author</dt>
            <dd className="font-mono text-gray-700 text-xs">{truncateAddr(ms.author_address)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">IPFS CID</dt>
            <dd>
              <a
                href={`https://ipfs.io/ipfs/${ms.cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-mono text-xs"
              >
                {ms.cid.slice(0, 18)}…
                <ExternalLink className="w-3 h-3" />
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Plagiarism score</dt>
            <dd className="text-gray-700">
              {ms.plagiarism_score !== null ? `${ms.plagiarism_score}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Submission tx</dt>
            <dd><TxLink hash={ms.submit_tx_hash} /></dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Assigned reviewers</dt>
            <dd className="text-gray-700">{ms.reviewers.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Reviews received</dt>
            <dd className="text-gray-700">
              {ms.reviews.length} / {ms.reviewers.length}
              {ms.reviews.length > 0 && (
                <span className="ml-2 text-xs text-gray-400">
                  ({ms.accept_count}A · {ms.revise_count}R · {ms.reject_count}X)
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Wrong status warning */}
      {notUnderReview && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
          <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Reviews not open</p>
            <p className="mt-0.5 text-amber-700">
              This manuscript is currently in <strong>{ms.status.replace(/_/g, " ")}</strong> state.
              Reviews can only be submitted when it is <strong>UNDER REVIEW</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Success state */}
      {indexed ? (
        <div className="bg-white border border-green-200 rounded-3xl p-8 shadow-sm text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Review indexed</h3>
            <p className="text-gray-500 text-sm mt-1">
              Your review has been confirmed on-chain and is now visible in the tracker.
            </p>
          </div>
          {pendingTxHash && (
            <div className="flex justify-center">
              <TxLink hash={pendingTxHash} />
            </div>
          )}
          <div className="pt-2 flex justify-center gap-3 flex-wrap">
            <Link
              href={`/tracker/${msId}`}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              View manuscript
            </Link>
            <Link
              href="/tracker"
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
            >
              Back to tracker
            </Link>
          </div>
        </div>
      ) : pendingTxHash ? (
        /* Pending indexer sync banner */
        <div className="bg-white border border-indigo-200 rounded-3xl p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-gray-900">Transaction sent — syncing with blockchain</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Your review is confirmed on-chain. Waiting for the indexer to pick it up (usually a few seconds)…
              </p>
            </div>
          </div>
          <div className="pl-9 space-y-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Transaction hash</p>
            <TxLink hash={pendingTxHash} />
          </div>
          <div className="pl-9">
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-1.5 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        </div>
      ) : (
        /* Review form */
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Verdict selection */}
          <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="font-bold text-gray-900">Your Verdict</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {VERDICT_OPTIONS.map((opt) => {
                const active = verdict === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVerdict(opt.value)}
                    disabled={notUnderReview}
                    className={`
                      flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 text-left transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${active ? opt.activeColor : opt.color}
                    `}
                  >
                    <span className={`${opt.iconColor} ${active ? "" : "opacity-70"}`}>
                      {opt.icon}
                    </span>
                    <span className="font-semibold text-sm">{opt.label}</span>
                    <span className="text-xs opacity-70 leading-snug">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-3">
            <div>
              <h2 className="font-bold text-gray-900">Review Comments</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Your comments will be hashed (Keccak-256) and stored on-chain for integrity. The full text is not stored on-chain.
              </p>
            </div>
            <textarea
              id="comments"
              required
              rows={8}
              disabled={notUnderReview}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Provide your detailed assessment: methodology, originality, clarity, and specific recommendations…"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <p className="text-right text-xs text-gray-400">{comments.length} characters</p>
          </div>

          {/* Error */}
          {submitError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {submitError}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Signed anonymously with your one-time reviewer wallet — the author never learns who you are. No MetaMask, no gas required.
            </p>
            <button
              type="submit"
              disabled={submitting || signing || verdict === null || comments.trim() === "" || notUnderReview}
              className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              {signing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Signing anonymously…</span></>
              ) : submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Submitting…</span></>
              ) : (
                <><Send className="w-4 h-4" /><span>Submit Review</span></>
              )}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
