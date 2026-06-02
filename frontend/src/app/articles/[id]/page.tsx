import Link from "next/link";
import { FileText, User, Calendar, ExternalLink, MessageCircle } from "lucide-react";

// In a real app, this would be fetched from the smart contract/IPFS based on the ID
const getMockArticle = (id: string) => ({
  id,
  title: id === "1" ? "Quantum Entanglement in Macroscopic Systems" : "Advancements in Zero-Knowledge Proofs",
  author: "0x1234567890abcdef1234567890abcdef12345678",
  status: id === "1" ? "Under Review" : "Published",
  date: "2024-05-12",
  abstract: "This paper explores the theoretical boundaries of quantum entanglement in macroscopic systems, proposing a novel framework for observation without collapse. We provide mathematical proofs and simulate the environment in a highly controlled setting.",
  ipfsHash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
});

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getMockArticle(id);

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <Link href="/articles" className="text-indigo-400 hover:text-indigo-300 text-sm mb-6 inline-block transition-colors">
        &larr; Back to Articles
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-xl mb-8">
        <div className="flex justify-between items-start mb-6">
          <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${
            article.status === "Published" 
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}>
            {article.status}
          </span>
          <Link href={`/articles/${id}/peer-reviews`} className="flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20">
            <FileText className="w-4 h-4" />
            <span>View Peer Reviews</span>
          </Link>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
          {article.title}
        </h1>

        <div className="flex flex-wrap gap-6 text-sm text-slate-400 mb-8 pb-8 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4" />
            <span>{article.author.slice(0,6)}...{article.author.slice(-4)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4" />
            <span>{article.date}</span>
          </div>
        </div>

        <div className="prose prose-invert max-w-none">
          <h3 className="text-xl font-semibold text-slate-200 mb-4">Abstract</h3>
          <p className="text-slate-300 leading-relaxed text-lg">
            {article.abstract}
          </p>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-800">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Document Access</h3>
          <a 
            href={`https://ipfs.io/ipfs/${article.ipfsHash}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl transition-colors border border-slate-700"
          >
            <ExternalLink className="w-5 h-5 text-indigo-400" />
            <span>View IPFS Document</span>
          </a>
        </div>
      </div>

      {/* Comment Section Mock */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-xl">
        <h3 className="text-2xl font-bold text-white flex items-center space-x-3 mb-6">
          <MessageCircle className="w-6 h-6 text-indigo-400" />
          <span>Discussion</span>
        </h3>
        
        <div className="mb-8">
          <textarea
            rows={3}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none mb-3"
            placeholder="Share your thoughts on this manuscript..."
          />
          <div className="flex justify-end">
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors text-sm">
              Post Comment
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Mock Comment */}
          <div className="flex space-x-4">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center border border-slate-700">
              <span className="text-xs">0x</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl rounded-tl-none p-4 flex-1">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-slate-300 text-sm">0xabcd...ef12</span>
                <span className="text-xs text-slate-500">2 days ago</span>
              </div>
              <p className="text-slate-400 text-sm">
                Interesting findings! However, I wonder how this scales with larger systems. Has the author considered the impact of thermal decoherence?
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
