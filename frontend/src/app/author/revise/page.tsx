"use client";

import { Suspense, useEffect, useState } from "react";
import { UploadCloud, Edit3, Send, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";
import { getNonce, getSubmissionKey, signTypedDataWith } from "@/core/services/wallet";

interface ManuscriptLookup {
  ms_id: number;
  cid: string;
  status: string;
  version: number;
  author_address: string;
}

export default function ReviseManuscriptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ReviseManuscriptForm />
    </Suspense>
  );
}

function ReviseManuscriptForm() {
  const { isAuthenticated: isConnected, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  const initialId = searchParams?.get("id") ?? "";
  const [manuscriptId, setManuscriptId] = useState(initialId);
  const [ms, setMs] = useState<ManuscriptLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(/^\d+$/.test(initialId));

  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"form" | "uploading" | "signing" | "submitting">("form");

  // setLooking(true) happens here (a regular event handler), not in the effect
  // below, so the effect itself never calls setState synchronously.
  const handleIdChange = (value: string) => {
    setManuscriptId(value);
    setMs(null);
    setLookupError(null);
    setLooking(/^\d+$/.test(value));
  };

  useEffect(() => {
    if (!manuscriptId || !/^\d+$/.test(manuscriptId)) return;
    let active = true;
    apiClient
      .get<ManuscriptLookup>(`/manuscripts/${manuscriptId}`)
      .then((res) => { if (active) { setMs(res.data); setLookupError(null); } })
      .catch(() => { if (active) { setMs(null); setLookupError("Manuscript not found."); } })
      .finally(() => { if (active) setLooking(false); });
    return () => { active = false; };
  }, [manuscriptId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center space-y-4 max-w-md bg-white p-8 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Authentication Required</h2>
          <p className="text-gray-600">Please login to your account to revise a manuscript.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const notRevisable = ms !== null && ms.status !== "REVISION_REQUESTED";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ms || notRevisable) return;
    if (!file) return addToast("Please select a file to upload.", "error");

    // The on-chain author IS the burner SubmissionWallet from the original
    // submission; its key lives only in the browser that submitted.
    const pk = getSubmissionKey(ms.author_address);
    if (!pk) {
      addToast(
        "Submission wallet key not found in this browser. Revisions must be submitted from the same device/browser used for the original submission.",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      setStep("uploading");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await apiClient.post<{ cid: string }>(
        "/manuscripts/upload/file",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newCid = uploadRes.data.cid;

      setStep("signing");
      const nonce = await getNonce(ms.author_address as `0x${string}`);
      const signature = await signTypedDataWith(
        pk,
        {
          ReviseManuscript: [
            { name: "msId", type: "uint256" },
            { name: "newCid", type: "string" },
            { name: "nonce", type: "uint256" },
          ],
        },
        "ReviseManuscript",
        { msId: BigInt(ms.ms_id), newCid, nonce },
      );

      setStep("submitting");
      await apiClient.post(`/manuscripts/${ms.ms_id}/revise`, {
        newCid,
        signature,
        nonce: nonce.toString(),
      });

      addToast("Revision submitted to the blockchain!", "success");
      router.push(`/tracker/${ms.ms_id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as { message?: string })?.message ??
        "Submission failed. Please try again.";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        addToast("Signature cancelled.", "error");
      } else {
        addToast(msg, "error");
      }
      setStep("form");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabel: Record<typeof step, string> = {
    form: "Submit Revision",
    uploading: "Uploading to IPFS…",
    signing: "Signing with submission wallet…",
    submitting: "Submitting on-chain…",
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center space-x-3">
          <Edit3 className="w-8 h-8 text-indigo-600" />
          <span>Revise Manuscript</span>
        </h1>
        <p className="text-gray-600 mt-2 text-lg">
          Submit an updated version of your manuscript based on reviewer feedback.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6">
        <div>
          <label htmlFor="manuscriptId" className="block text-sm font-medium text-gray-700 mb-2">
            Manuscript ID
          </label>
          <input
            type="text"
            id="manuscriptId"
            required
            value={manuscriptId}
            onChange={(e) => handleIdChange(e.target.value.trim())}
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            placeholder="e.g., 1"
          />
          {looking && <p className="text-gray-400 text-xs mt-1.5">Looking up manuscript…</p>}
          {lookupError && <p className="text-red-600 text-xs mt-1.5">{lookupError}</p>}
          {ms && (
            <p className="text-xs mt-1.5 text-gray-500">
              Current version {ms.version}, status <span className="font-medium">{ms.status.replace(/_/g, " ")}</span>
            </p>
          )}
        </div>

        {notRevisable && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              This manuscript isn&apos;t awaiting revision — only manuscripts in{" "}
              <strong>REVISION REQUESTED</strong> status can be revised.
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Revised PDF Document
          </label>
          <label htmlFor="file-upload" className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-4 group-hover:text-indigo-500 transition-colors" />
            <p className="text-gray-700 font-medium">
              {file ? file.name : "Drag & drop your revised PDF here"}
            </p>
            {!file && <p className="text-gray-500 text-sm mt-1">or click to browse from your computer</p>}
            <input id="file-upload" type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          </label>
        </div>

        {isSubmitting && step !== "form" && (
          <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-sm text-indigo-800">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-indigo-800 rounded-full animate-spin flex-shrink-0" />
            <span>{stepLabel[step]}</span>
          </div>
        )}

        <div className="pt-6 border-t border-gray-200 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !ms || notRevisable}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium transition-all shadow-sm"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span>{stepLabel[step]}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
