"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Loader2,
  Clock,
  XCircle,
  CheckCircle2,
  Wallet,
  Info,
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

interface FieldRequest {
  id: number;
  fields: string[];
  status: string; // pending | approved | rejected | superseded
  created_at: string;
}

interface SpecializationState {
  verified_fields: string[];
  wallet_address: string;
  request: FieldRequest | null;
}

export default function ReviewerSpecializationPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [state, setState] = useState<SpecializationState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    return apiClient
      .get<SpecializationState>("/reviewer/specialization")
      .then((res) => {
        setState(res.data);
        const initial =
          res.data.request?.fields?.length
            ? res.data.request.fields
            : res.data.verified_fields ?? [];
        setSelected(initial);
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
      .catch(() => addToast("Failed to load your specialization.", "error"))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, user, router, load, addToast]);

  const toggle = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );

  const submit = useCallback(async () => {
    if (selected.length === 0) {
      addToast("Select at least one field.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/reviewer/specialization", { fields: selected });
      addToast("Submitted for editor verification.", "success");
      await load();
    } catch (err: unknown) {
      addToast(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Submission failed.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }, [selected, addToast, load]);

  if (isLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const verified = state?.verified_fields ?? [];
  const request = state?.request ?? null;
  const hasWallet = !!state?.wallet_address;
  const isPending = request?.status === "pending";
  const unchanged =
    selected.length > 0 &&
    request &&
    [...selected].sort().join(",") === [...request.fields].sort().join(",") &&
    request.status === "pending";

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
          <BadgeCheck className="w-8 h-8 text-indigo-600" />
          My Specialization
        </h1>
        <p className="text-gray-500 mt-2">
          Declare the subject fields you can review. An editor verifies them before you can be
          assigned to manuscripts of that field.
        </p>
      </div>

      {/* Status summary */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            Verified fields (on-chain)
          </p>
          {verified.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {verified.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-sm bg-green-100 text-green-800 rounded-full px-3 py-1 font-medium"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {fieldLabel(f)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">None yet — awaiting editor approval.</p>
          )}
        </div>

        {request && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Latest request
            </p>
            <div className="flex items-center gap-2 text-sm">
              {request.status === "pending" && (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Clock className="w-4 h-4" /> Pending editor review
                </span>
              )}
              {request.status === "approved" && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> Approved
                </span>
              )}
              {request.status === "rejected" && (
                <span className="inline-flex items-center gap-1 text-red-700">
                  <XCircle className="w-4 h-4" /> Rejected
                </span>
              )}
              {request.status === "superseded" && (
                <span className="text-gray-500">Superseded by a newer request</span>
              )}
              <span className="text-gray-400">— {request.fields.map(fieldLabel).join(", ")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Wallet reminder */}
      {!hasWallet && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <Wallet className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            You haven&apos;t bound a wallet yet. The editor can only verify you on-chain once you
            do —{" "}
            <Link href="/profile" className="font-medium underline">
              bind a wallet
            </Link>
            .
          </span>
        </div>
      )}

      {/* Edit form */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-gray-900">
            {verified.length > 0 || request ? "Change your fields" : "Declare your fields"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Select one or more. Submitting sends the set to an editor and replaces any pending
            request. Changing verified fields requires re-verification.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FIELDS.map((f) => {
            const active = selected.includes(f.slug);
            return (
              <button
                key={f.slug}
                type="button"
                onClick={() => toggle(f.slug)}
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

        {isPending && (
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="w-4 h-4 flex-shrink-0" />
            You already have a pending request. Submitting again replaces it.
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={submitting || selected.length === 0 || !!unchanged}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BadgeCheck className="w-4 h-4" />
            )}
            Submit for verification
          </button>
        </div>
      </div>
    </div>
  );
}
