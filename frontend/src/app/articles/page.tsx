"use client";

import { useState } from "react";
import { Search, Filter, BookOpen } from "lucide-react";
import Link from "next/link";

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
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center space-x-3">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            <span>Research Hub</span>
          </h1>
          <p className="text-gray-600 mt-2 text-lg">Explore decentralized academic publications and peer reviews.</p>
        </div>
        
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            />
          </div>
          <div className="relative">
            <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-lg pl-10 pr-8 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all cursor-pointer shadow-sm"
            >
              <option value="All">All Status</option>
              <option value="Under Review">Under Review</option>
              <option value="Published">Published</option>
            </select>
          </div>
        </div>
      </header>

      <section className="grid gap-6">
        {filteredArticles.map((article) => (
          <article key={article.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer">
            <Link href={`/articles/${article.id}`} className="block">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {article.title}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  article.status === "Published" 
                    ? "bg-green-50 text-green-700 border-green-200" 
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}>
                  {article.status}
                </span>
              </div>
              <p className="text-gray-600 mb-6 line-clamp-2">{article.abstract}</p>
              
              <footer className="flex items-center space-x-6 text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                    <span className="text-[10px] font-medium text-gray-600">0x</span>
                  </div>
                  <span className="font-medium text-gray-700">{article.author}</span>
                </div>
                <span>&bull;</span>
                <time dateTime={article.date}>{article.date}</time>
              </footer>
            </Link>
          </article>
        ))}
        {filteredArticles.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
            <p className="text-gray-500">No articles found matching your criteria.</p>
          </div>
        )}
      </section>
    </div>
  );
}
