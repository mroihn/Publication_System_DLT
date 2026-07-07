"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Loader2, Wallet, ExternalLink, Info } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useToast } from "@/core/context/ToastContext";
import { apiClient } from "@/core/services/api.client";
import {
  getJrtBalance,
  withdrawFromSession,
  type WithdrawStep,
} from "@/core/services/wallet";

interface ReviewerAssignment {
  ms_id: number;
  status: string;
  session_address: string;
  session_privkey: string;
}

const EXPLORER = "https://sepolia.etherscan.io";

function fmtJrt(wei: bigint): string {
  return (wei / 10n ** 18n).toString();
}

export default function ReviewerEarningsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [assignments, setAssignments] = useState<ReviewerAssignment[]>([]);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<Record<string, WithdrawStep | null>>({});

  const loadBalances = useCallback(async (list: ReviewerAssignment[]) => {
    const entries = await Promise.all(
      list.map(async (a) => {
        try {
          const bal = await getJrtBalance(a.session_address as `0x${string}`);
          return [a.session_address, bal] as const;
        } catch {
          return [a.session_address, 0n] as const;
        }
      })
    );
    setBalances(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    // setState is kept inside the promise callbacks (not called synchronously in
    // the effect body) to satisfy the react-hooks/set-state-in-effect rule.
    apiClient
      .get<{ data: ReviewerAssignment[] }>("/reviewer/assignments")
      .then((res) => {
        // De-duplicate by session wallet.
        const seen = new Set<string>();
        const unique = res.data.data.filter((a) => {
          if (seen.has(a.session_address)) return false;
          seen.add(a.session_address);
          return true;
        });
        setAssignments(unique);
        return loadBalances(unique);
      })
      .catch(() => addToast("Failed to load your reviewer earnings.", "error"))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, router, addToast, loadBalances]);

  const handleWithdraw = useCallback(
    async (a: ReviewerAssignment) => {
      setWithdrawing((w) => ({ ...w, [a.session_address]: "funding-gas" }));
      try {
        const { amount } = await withdrawFromSession(
          a.session_privkey as `0x${string}`,
          (step) => setWithdrawing((w) => ({ ...w, [a.session_address]: step }))
        );
        addToast(`Withdrew ${fmtJrt(amount)} JRT to your main wallet.`, "success");
        setBalances((b) => ({ ...b, [a.session_address]: 0n }));
      } catch (err: unknown) {
        const msg =
          (err as { shortMessage?: string })?.shortMessage ??
          (err as { message?: string })?.message ??
          "Withdrawal failed.";
        addToast(
          msg.includes("rejected") || msg.includes("denied") ? "Transaction cancelled." : msg,
          "error"
        );
      } finally {
        setWithdrawing((w) => ({ ...w, [a.session_address]: null }));
      }
    },
    [addToast]
  );

  if (isLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
          <Coins className="w-8 h-8 text-indigo-600" />
          Reviewer Earnings
        </h1>
        <p className="text-gray-500 mt-2">
          Each review you complete earns 10 JRT into a one-time anonymous wallet. Withdraw it to your main wallet anytime.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Withdrawing sends a little gas from your main wallet to the anonymous wallet first. This
          creates a small on-chain link between them — the review itself stays unlinkable.
        </span>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center text-gray-500">
          You have no reviewer session wallets yet.
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const bal = balances[a.session_address] ?? 0n;
            const step = withdrawing[a.session_address] ?? null;
            return (
              <div
                key={a.session_address}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-wrap items-center gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Manuscript #{a.ms_id}</p>
                  <a
                    href={`${EXPLORER}/address/${a.session_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono text-indigo-600 hover:text-indigo-800"
                  >
                    {a.session_address.slice(0, 10)}…{a.session_address.slice(-6)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-lg font-bold text-gray-900">{fmtJrt(bal)} JRT</p>
                </div>
                <button
                  onClick={() => handleWithdraw(a)}
                  disabled={step !== null || bal === 0n}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {step === "funding-gas" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Funding gas…</>
                  ) : step === "withdrawing" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Withdrawing…</>
                  ) : (
                    "Withdraw"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
