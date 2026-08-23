"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";

const FIELDS: { slug: string; label: string }[] = [
  { slug: "ai", label: "AI" },
  { slug: "computer-security", label: "Computer Security" },
  { slug: "blockchain", label: "Blockchain" },
  { slug: "cloud-computing", label: "Cloud Computing" },
  { slug: "data-science", label: "Data Science" },
];
const fieldLabel = (slug: string) => FIELDS.find((f) => f.slug === slug)?.label ?? slug;

interface Verification {
  id: number;
  user_id: string;
  email: string;
  wallet_address: string;
  fields: string[];
  status: string;
  created_at: string;
  current_role: string;
  identity_email: string;
}

interface PendingManuscript {
  ms_id: number;
  cid: string;
  metadata: string;
  status: string;
  field: string | null;
  author_address: string;
  created_at: string;
}

function truncate(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseTitle(metadata: string): string {
  try {
    const m = JSON.parse(metadata);
    return m.title || "Untitled";
  } catch {
    return "Untitled";
  }
}

export default function EditorDashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [tab, setTab] = useState<"verifications" | "manuscripts">("verifications");
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [manuscripts, setManuscripts] = useState<PendingManuscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Per-manuscript screening form state
  const [screen, setScreen] = useState<Record<number, { field: string; message: string }>>({});

  const load = useCallback(() => {
    return Promise.all([
      apiClient.get<{ data: Verification[] }>("/editor/reviewer-verifications"),
      apiClient.get<{ data: PendingManuscript[] }>("/editor/manuscripts"),
    ]).then(([v, m]) => {
      setVerifications(v.data.data);
      setManuscripts(m.data.data);
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (user?.role !== "editor") {
      router.push("/profile");
      return;
    }
    load()
      .catch(() => addToast("Failed to load editor dashboard.", "error"))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, user, router, load, addToast]);

  const decideVerification = useCallback(
    async (id: number, approve: boolean) => {
      setBusy(`v-${id}`);
      try {
        await apiClient.post(`/editor/reviewer-verifications/${id}/decision`, { approve });
        addToast(approve ? "Reviewer verified on-chain." : "Verification rejected.", "success");
        setVerifications((prev) => prev.filter((v) => v.id !== id));
      } catch (err: unknown) {
        addToast(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Action failed.",
          "error"
        );
      } finally {
        setBusy(null);
      }
    },
    [addToast]
  );

  const reviewManuscript = useCallback(
    async (msId: number, approve: boolean) => {
      const form = screen[msId] ?? { field: "", message: "" };
      if (approve && !form.field) {
        addToast("Select a field to approve.", "error");
        return;
      }
      setBusy(`m-${msId}`);
      try {
        await apiClient.post(`/editor/manuscripts/${msId}/review`, {
          approve,
          field: form.field,
          message: form.message,
        });
        addToast(
          approve ? "Approved — reviewers are being selected." : "Manuscript desk-rejected.",
          "success"
        );
        setManuscripts((prev) => prev.filter((m) => m.ms_id !== msId));
      } catch (err: unknown) {
        addToast(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Action failed.",
          "error"
        );
      } finally {
        setBusy(null);
      }
    },
    [screen, addToast]
  );

  if (isLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-600" />
          Editor Dashboard
        </h1>
        <p className="text-gray-500 mt-2">
          Verify reviewer specializations and screen manuscripts before peer review.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab("verifications")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "verifications"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Reviewer Verifications
          {verifications.length > 0 && (
            <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">
              {verifications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("manuscripts")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "manuscripts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Manuscripts to Screen
          {manuscripts.length > 0 && (
            <span className="ml-2 text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
              {manuscripts.length}
            </span>
          )}
        </button>
      </div>

      {/* Reviewer verifications */}
      {tab === "verifications" &&
        (verifications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center text-gray-500">
            No pending reviewer verifications.
          </div>
        ) : (
          <div className="space-y-3">
            {verifications.map((v) => (
              <div
                key={v.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-wrap items-center gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{v.email}</p>
                    {v.current_role === "user" && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
                        user → reviewer
                      </span>
                    )}
                    {v.identity_email && (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                        ✓ verified ({v.identity_email})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono">
                    {v.wallet_address ? truncate(v.wallet_address) : "no wallet bound"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {v.fields.map((f) => (
                      <span
                        key={f}
                        className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 font-medium"
                      >
                        {fieldLabel(f)}
                      </span>
                    ))}
                  </div>
                  {!v.wallet_address && (
                    <p className="text-xs text-amber-600 mt-1">
                      Reviewer must bind a wallet before they can be verified on-chain.
                    </p>
                  )}
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => decideVerification(v.id, true)}
                    disabled={busy === `v-${v.id}` || !v.wallet_address}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {busy === `v-${v.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => decideVerification(v.id, false)}
                    disabled={busy === `v-${v.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Manuscripts to screen */}
      {tab === "manuscripts" &&
        (manuscripts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center text-gray-500">
            No manuscripts awaiting editor screening.
          </div>
        ) : (
          <div className="space-y-4">
            {manuscripts.map((m) => {
              const form = screen[m.ms_id] ?? { field: "", message: "" };
              const setForm = (patch: Partial<{ field: string; message: string }>) =>
                setScreen((s) => ({ ...s, [m.ms_id]: { ...form, ...patch } }));
              return (
                <div key={m.ms_id} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">
                        #{m.ms_id} — {parseTitle(m.metadata)}
                      </p>
                      <p className="text-xs text-gray-400">
                        by {truncate(m.author_address)} ·{" "}
                        <a
                          href={`https://ipfs.io/ipfs/${m.cid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                        >
                          view file <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Field of study
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {FIELDS.map((f) => {
                        const active = form.field === f.slug;
                        return (
                          <button
                            key={f.slug}
                            type="button"
                            onClick={() => setForm({ field: f.slug })}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                              active
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-white border-gray-300 text-gray-700 hover:border-indigo-400"
                            }`}
                          >
                            {active ? "✓ " : ""}
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ message: e.target.value })}
                    placeholder="Message to the author (optional)…"
                    className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => reviewManuscript(m.ms_id, false)}
                      disabled={busy === `m-${m.ms_id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Desk-Reject
                    </button>
                    <button
                      onClick={() => reviewManuscript(m.ms_id, true)}
                      disabled={busy === `m-${m.ms_id}` || !form.field}
                      className="inline-flex items-center gap-1.5 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      {busy === `m-${m.ms_id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Approve → Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
