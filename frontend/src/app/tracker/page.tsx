"use client";

import { CheckCircle2, Clock, XCircle, FileText } from "lucide-react";
import Link from "next/link";

const STATUS_STEPS = ["CHECKING", "UNDER_REVIEW", "REVISION_REQUESTED", "ACCEPTED", "PUBLISHED", "REJECTED"];

const MOCK_MANUSCRIPTS = [
  { id: 1, title: "A Novel Approach to Quantum Computing", currentStatus: "UNDER_REVIEW", date: "2024-05-12" },
  { id: 2, title: "Zero-Knowledge Proofs in Decentralized Systems", currentStatus: "PUBLISHED", date: "2024-03-08" },
  { id: 3, title: "Inefficiencies in Consensus Algorithms", currentStatus: "REJECTED", date: "2024-01-22" }
];

export default function StatusTrackerPage() {
  const getStepStatus = (currentStatus: string, stepName: string) => {
    const currentIndex = STATUS_STEPS.indexOf(currentStatus);
    const stepIndex = STATUS_STEPS.indexOf(stepName);
    
    if (currentStatus === "REJECTED" && stepName === "REJECTED") return "current";
    if (currentStatus === "REJECTED") return "past";
    if (stepName === "REJECTED") return "upcoming";

    // Handle skip for REVISION_REQUESTED
    if (currentStatus === "ACCEPTED" || currentStatus === "PUBLISHED") {
        if (stepName === "REVISION_REQUESTED") return "skipped";
    }

    if (stepIndex < currentIndex) return "past";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
          Manuscript Status Tracker
        </h1>
        <p className="text-gray-600 text-lg">
          Track the real-time publication progress of your submissions on the decentralized network.
        </p>
      </div>
      
      <div className="space-y-8">
        {MOCK_MANUSCRIPTS.map((ms) => (
          <div key={ms.id} className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{ms.title}</h2>
                <p className="text-sm text-gray-500 font-medium">Submitted on {ms.date}</p>
              </div>
              <Link 
                href={`/articles/${ms.id}`}
                className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 font-medium transition-colors bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100"
              >
                <FileText className="w-4 h-4" />
                <span>View Details</span>
              </Link>
            </div>
            
            <div className="relative">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-6 md:space-y-0 w-full">
                {STATUS_STEPS.filter(s => s !== "REJECTED" && s !== "REVISION_REQUESTED").map((step, idx, arr) => {
                  const status = getStepStatus(ms.currentStatus, step);
                  return (
                    <div key={step} className="flex items-center flex-1 relative z-10 w-full">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${
                          status === "past" ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" :
                          status === "current" ? "border-indigo-600 text-indigo-600 bg-white ring-4 ring-indigo-50" :
                          "border-gray-300 text-gray-400 bg-white"
                        }`}>
                          {status === "past" ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                        </div>
                        <span className={`text-xs font-bold mt-3 text-center w-28 uppercase tracking-wider ${
                            status === "past" || status === "current" ? "text-gray-900" : "text-gray-400"
                        }`}>
                          {step.replace('_', ' ')}
                        </span>
                      </div>
                      
                      {/* Progress Line */}
                      {idx < arr.length - 1 && (
                        <div className="hidden md:block flex-1 h-1.5 mx-4 rounded-full bg-gray-100 relative overflow-hidden">
                           <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                             status === "past" ? "w-full bg-indigo-600" : "w-0 bg-indigo-600"
                           }`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {ms.currentStatus === "REJECTED" && (
              <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center text-red-800 shadow-sm">
                <XCircle className="w-6 h-6 mr-3 flex-shrink-0" /> 
                <span className="font-medium">This manuscript has been rejected by the peer review consensus and cannot proceed.</span>
              </div>
            )}
            
            {ms.currentStatus === "REVISION_REQUESTED" && (
              <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center text-amber-800 shadow-sm">
                <Clock className="w-6 h-6 mr-3 flex-shrink-0" /> 
                <span className="font-medium">The reviewers have requested revisions. Please submit a revised manuscript to continue.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
