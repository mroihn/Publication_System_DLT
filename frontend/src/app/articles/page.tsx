"use client";

import { useState } from "react";
import { Search, Filter, BookOpen } from "lucide-react";
import Link from "next/link";

// Mock data to simulate contract reading
const MOCK_ARTICLES = [
  {
    id: "1",
    title: "Quantum Entanglement in Macroscopic Systems",
    author: "0x1234...5678",
    status: "Under Review",
    date: "2024-05-12",
    abstract: "This paper explores the theoretical boundaries of quantum entanglement...",
  },
  {
    id: "2",
    title: "Advancements in Zero-Knowledge Proofs for Rollups",
    author: "0x8765...4321",
    status: "Published",
    date: "2024-05-10",
    abstract: "A novel approach to recursive SNARKs that reduces prover time by 40%...",
  },
];

export default function ArticlesHubPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const filteredArticles = MOCK_ARTICLES.filter((article) => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "All" || article.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <BookOpen className="w-8 h-8 text-indigo-400" />
            <span>Research Hub</span>
          </h1>
          <p className="text-slate-400 mt-2">Explore decentralized academic publications and peer reviews.</p>
        </div>
        
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-8 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Under Review">Under Review</option>
              <option value="Published">Published</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredArticles.map((article) => (
          <Link href={`/articles/${article.id}`} key={article.id}>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all group cursor-pointer">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                  {article.title}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  article.status === "Published" 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {article.status}
                </span>
              </div>
              <p className="text-slate-400 mb-6 line-clamp-2">{article.abstract}</p>
              
              <div className="flex items-center space-x-6 text-sm text-slate-500">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                    <span className="text-[10px]">0x</span>
                  </div>
                  <span>{article.author}</span>
                </div>
                <span>•</span>
                <span>{article.date}</span>
              </div>
            </div>
          </Link>
        ))}
        {filteredArticles.length === 0 && (
          <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
            <p className="text-slate-400">No articles found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
