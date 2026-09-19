"use client";

import { useEffect, useState } from "react";
import { UploadCloud, FileText, Send, PenLine } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";
import { generateSessionWallet, saveSubmissionKey, signTypedDataWith, getNonce } from "@/core/services/wallet";

interface Journal {
  id: number;
  name: string;
  category_slug: string;
  category_label: string;
}

export default function SubmitManuscriptPage() {
  const { isAuthenticated: isConnected, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"form" | "uploading" | "signing" | "submitting">("form");

  useEffect(() => {
    apiClient
      .get<{ data: Journal[] }>("/journals")
      .then((res) => setJournals(res.data.data))
      .catch(() => setJournals([]));
  }, []);

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
          <p className="text-gray-600">Please login to your account to submit a manuscript.</p>
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

  const stepLabel: Record<typeof step, string> = {
    form: "Submit Anonymously",
    uploading: "Uploading to IPFS…",
    signing: "Generating anonymous identity…",
    submitting: "Submitting on-chain…",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return addToast("Please select a file to upload.", "error");
    const journal = journals.find((j) => String(j.id) === journalId);
    if (!journal) return addToast("Please choose a target journal.", "error");

    setIsSubmitting(true);
    try {
      // Step 1: upload file to IPFS, receive CID
      setStep("uploading");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await apiClient.post<{ cid: string }>(
        "/manuscripts/upload/file",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const cid = uploadRes.data.cid;

      // Step 2: generate an anonymous SubmissionWallet and sign with it (no MetaMask).
      // On-chain the author becomes this random burner address, so reviewers can
      // never link the manuscript to the real author. The private key stays in this
      // browser (localStorage) and is later required to pay the publication fee.
      setStep("signing");
      const { address: submissionAddress, privateKey } = generateSessionWallet();
      saveSubmissionKey(submissionAddress, privateKey);

      const nonce = await getNonce(submissionAddress);
      // The journal travels inside the signed metadata, so the author's choice of
      // venue is part of what goes on-chain rather than an unsigned side-channel.
      const metadata = JSON.stringify({
        title,
        abstract,
        journal: { id: journal.id, name: journal.name, category: journal.category_slug },
      });

      const signature = await signTypedDataWith(
        privateKey,
        {
          SubmitManuscript: [
            { name: "cid", type: "string" },
            { name: "metadata", type: "string" },
            { name: "nonce", type: "uint256" },
          ],
        },
        "SubmitManuscript",
        { cid, metadata, nonce },
      );

      // Step 3: submit signed data to backend → contract (backend relays + saves mapping)
      // metadata must be the exact string that was signed — do not reconstruct it
      setStep("submitting");
      await apiClient.post("/manuscripts/submit", {
        cid,
        metadata,
        signature,
        nonce: nonce.toString(),
        submissionAddress,
      });

      addToast("Manuscript submitted to the blockchain!", "success");
      router.push("/tracker");
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ??
        "Submission failed. Please try again.";
      // User cancelled MetaMask signing
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

  return (
    <div className="max-w-3xl mx-auto w-full p-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center space-x-3">
          <FileText className="w-8 h-8 text-indigo-600" />
          <span>Submit Manuscript</span>
        </h1>
        <p className="text-gray-600 mt-2 text-lg">
          Upload your academic work to the decentralized network and initiate the peer review process.
        </p>
        <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
          <PenLine className="w-4 h-4" />
          Submitted anonymously via a one-time wallet — reviewers cannot see who you are. No MetaMask signature needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Manuscript Title
          </label>
          <input
            type="text"
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            placeholder="e.g., A Novel Approach to Quantum Computing"
          />
        </div>

        <div>
          <label htmlFor="abstract" className="block text-sm font-medium text-gray-700 mb-2">
            Abstract
          </label>
          <textarea
            id="abstract"
            required
            rows={5}
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none shadow-sm"
            placeholder="Provide a concise summary of your research..."
          />
        </div>

        <div>
          <label htmlFor="journal" className="block text-sm font-medium text-gray-700 mb-2">
            Target Journal
          </label>
          <select
            id="journal"
            required
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          >
            <option value="" disabled>
              {journals.length ? "Select a journal…" : "Loading journals…"}
            </option>
            {journals.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name} — {j.category_label}
              </option>
            ))}
          </select>
          <p className="text-gray-500 text-xs mt-1.5">
            An editor specialising in this journal&apos;s category will be assigned automatically.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF Document
          </label>
          <label htmlFor="file-upload" className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-4 group-hover:text-indigo-500 transition-colors" />
            <p className="text-gray-700 font-medium">
              {file ? file.name : "Drag & drop your PDF here"}
            </p>
            {!file && <p className="text-gray-500 text-sm mt-1">or click to browse from your computer</p>}
            <input id="file-upload" type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          </label>
        </div>

        {isSubmitting && step !== "form" && (
          <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-sm text-indigo-800">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-indigo-800 rounded-full animate-spin flex-shrink-0" />
            <span>
              {step === "uploading" && "Uploading file to IPFS…"}
              {step === "signing" && "Generating your anonymous submission wallet…"}
              {step === "submitting" && "Submitting to the blockchain…"}
            </span>
          </div>
        )}

        <div className="pt-6 border-t border-gray-200 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
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
