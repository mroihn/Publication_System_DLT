"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2, Send, ExternalLink, User } from "lucide-react";
import { apiClient } from "@/core/services/api.client";
import { postDoiComment } from "@/core/services/wallet";
import { useAuth } from "@/core/context/AuthContext";
import { useToast } from "@/core/context/ToastContext";

interface Identity {
  address: string;
  email: string;
  real_wallet: string;
}

interface Comment {
  commenter: Identity;
  body: string;
  cid: string;
  tx_hash: string;
  posted_at: string;
}

const EXPLORER = "https://sepolia.etherscan.io";

function commenterName(id: Identity): string {
  if (id.email) return id.email;
  const a = id.real_wallet || id.address;
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "anonymous";
}

export function Comments({
  msId,
  doiTokenId,
  status,
}: {
  msId: string | number;
  doiTokenId: number | null;
  status: string;
}) {
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [step, setStep] = useState<"idle" | "uploading" | "signing" | "confirming">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const published = status === "PUBLISHED" && doiTokenId !== null;

  const load = useCallback(() => {
    return apiClient
      .get<{ data: Comment[] }>(`/manuscripts/${msId}/comments`)
      .then((res) => setComments(res.data.data));
  }, [msId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const submit = useCallback(async () => {
    if (doiTokenId === null || !body.trim()) return;
    try {
      setStep("uploading");
      const prep = await apiClient.post<{ hash: string; cid: string }>("/comments/prepare", {
        doiTokenId,
        body: body.trim(),
      });

      setStep("signing");
      await postDoiComment(doiTokenId, prep.data.hash as `0x${string}`);

      setStep("confirming");
      addToast("Comment posted — waiting for it to be indexed…", "success");
      setBody("");

      const startLen = comments.length;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const res = await apiClient.get<{ data: Comment[] }>(`/manuscripts/${msId}/comments`);
        if (res.data.data.length > startLen) {
          setComments(res.data.data);
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("idle");
        }
      }, 3000);
    } catch (err: unknown) {
      const msg =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as { message?: string })?.message ??
        "Failed to post comment.";
      addToast(msg.includes("rejected") ? "Transaction cancelled." : msg, "error");
      setStep("idle");
    }
  }, [doiTokenId, body, comments.length, msId, addToast]);

  return (
    <section className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">Comments</h2>
        <span className="text-sm text-gray-400">({comments.length})</span>
      </div>

      {published ? (
        isAuthenticated ? (
          <div className="space-y-2">
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts on this paper…"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            />
            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={step !== "idle" || !body.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {step === "uploading" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : step === "signing" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sign in MetaMask…</>
                ) : step === "confirming" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
                ) : (
                  <><Send className="w-4 h-4" /> Submit Comment</>
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Log in and connect a wallet to post a comment.</p>
        )
      ) : (
        <p className="text-sm text-gray-500">Comments open once this manuscript is published.</p>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c, i) => (
            <li key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{commenterName(c.commenter)}</span>
                  <span className="text-xs text-gray-400">{new Date(c.posted_at).toLocaleString()}</span>
                  {c.tx_hash && (
                    <a
                      href={`${EXPLORER}/tx/${c.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs text-indigo-500 hover:text-indigo-700"
                    >
                      tx <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">
                  {c.body || <span className="text-gray-400 italic">content unavailable</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
