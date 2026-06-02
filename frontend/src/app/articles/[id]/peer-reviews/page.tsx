import Link from "next/link";
import { Star, ShieldCheck, ClipboardList } from "lucide-react";

// Mock data to simulate contract reading
const MOCK_REVIEWS = [
  {
    id: "r1",
    reviewer: "0x9876...5432",
    score: 8,
    date: "2024-05-14",
    critique: "The methodology is robust, and the experimental setup is well-documented. However, section 3 lacks some clarity regarding the error margins. Overall, a strong contribution to the field.",
  },
  {
    id: "r2",
    reviewer: "0x4444...3333",
    score: 9,
    date: "2024-05-16",
    critique: "Excellent paper. The novel approach to observation without collapse is groundbreaking. The mathematical proofs hold up under scrutiny.",
  },
];

export default async function PeerReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const averageScore = MOCK_REVIEWS.reduce((acc, r) => acc + r.score, 0) / MOCK_REVIEWS.length;

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <Link href={`/articles/${id}`} className="text-indigo-400 hover:text-indigo-300 text-sm mb-6 inline-block transition-colors">
        &larr; Back to Article
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <ClipboardList className="w-8 h-8 text-indigo-400" />
          <span>Peer Review Reports</span>
        </h1>
        <p className="text-slate-400 mt-2">
          Transparent, immutable review history for Manuscript ID: {id}
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 shadow-xl flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-200">Consensus Score</h3>
          <p className="text-sm text-slate-400">Based on {MOCK_REVIEWS.length} reviews</p>
        </div>
        <div className="flex items-center space-x-2">
          <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
          <span className="text-4xl font-bold text-white">{averageScore.toFixed(1)}</span>
          <span className="text-xl text-slate-500">/ 10</span>
        </div>
      </div>

      <div className="space-y-6">
        {MOCK_REVIEWS.map((review) => (
          <div key={review.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-slate-200 text-sm flex items-center space-x-2">
                    <span>Reviewer</span>
                    <span className="text-indigo-400">{review.reviewer}</span>
                  </p>
                  <p className="text-xs text-slate-500">{review.date}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-sm font-bold text-slate-200">{review.score}</span>
              </div>
            </div>
            
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 text-sm leading-relaxed">
                {review.critique}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
