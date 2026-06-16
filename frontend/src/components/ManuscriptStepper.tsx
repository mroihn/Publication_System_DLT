"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";

const STEPS = ["CHECKING", "UNDER_REVIEW", "ACCEPTED", "PUBLISHED"];

function stepStatus(currentStatus: string, step: string): "past" | "current" | "upcoming" | "skipped" {
  if (currentStatus === "REJECTED") return "past";

  const ci = STEPS.indexOf(currentStatus);
  const si = STEPS.indexOf(step);

  if (ci === -1) return "upcoming";
  if (si < ci) return "past";
  if (si === ci) return "current";
  return "upcoming";
}

export function ManuscriptStepper({ status }: { status: string }) {
  if (status === "REJECTED") {
    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center text-red-800 shadow-sm">
        <XCircle className="w-6 h-6 mr-3 flex-shrink-0" />
        <span className="font-medium">This manuscript has been rejected by peer review consensus.</span>
      </div>
    );
  }

  if (status === "REVISION_REQUESTED") {
    return (
      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center text-amber-800 shadow-sm">
        <Clock className="w-6 h-6 mr-3 flex-shrink-0" />
        <span className="font-medium">Reviewers requested revisions. Submit a revised manuscript to continue.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-6 md:space-y-0 w-full">
      {STEPS.map((step, idx, arr) => {
        const st = stepStatus(status, step);
        return (
          <div key={step} className="flex items-center flex-1 relative z-10 w-full">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${
                st === "past"    ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" :
                st === "current" ? "border-indigo-600 text-indigo-600 bg-white ring-4 ring-indigo-50" :
                "border-gray-300 text-gray-400 bg-white"
              }`}>
                {st === "past" ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
              <span className={`text-xs font-bold mt-3 text-center w-28 uppercase tracking-wider ${
                st === "past" || st === "current" ? "text-gray-900" : "text-gray-400"
              }`}>
                {step.replace(/_/g, " ")}
              </span>
            </div>
            {idx < arr.length - 1 && (
              <div className="hidden md:block flex-1 h-1.5 mx-4 rounded-full bg-gray-100 relative overflow-hidden">
                <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                  st === "past" ? "w-full bg-indigo-600" : "w-0 bg-indigo-600"
                }`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
