"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { apiClient } from "@/core/services/api.client";

interface Identity {
  address: string;
  email: string;
  real_wallet: string;
}

interface Article {
  ms_id: number;
  title: string;
  abstract: string;
  status: string;
  version: number;
  cid: string;
  author: Identity;
  submit_timestamp: string | null;
  created_at: string;
}

const LIMIT = 9;

function identityLabel(id: Identity): string {
  if (id.email) return id.email;
  const a = id.real_wallet || id.address;
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CHECKING: "bg-amber-50 text-amber-700 border-amber-200",
    PENDING_EDITOR: "bg-purple-50 text-purple-700 border-purple-200",
    UNDER_REVIEW: "bg-blue-50 text-blue-700 border-blue-200",
    REVISION_REQUESTED: "bg-orange-50 text-orange-700 border-orange-200",
    ACCEPTED: "bg-green-50 text-green-700 border-green-200",
    PUBLISHED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function ArticlesHubPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ data: Article[]; total: number }>(`/manuscripts?page=${page}&limit=${LIMIT}&status=PUBLISHED`)
      .then((res) => {
        if (!active) return;
        setArticles(res.data.data);
        setTotal(res.data.total);
      })
      .catch(() => { if (active) setArticles([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  const goToPage = useCallback((p: number) => {
    setLoading(true);
    setPage(p);
  }, []);

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [articles, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

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

        <div className="relative w-full md:w-64">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <section className="grid gap-6">
          {filteredArticles.map((a) => (
            <article
              key={a.ms_id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer"
            >
              <Link href={`/articles/${a.ms_id}`} className="block">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {a.title}
                  </h2>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-gray-600 mb-6 line-clamp-2">
                  {a.abstract || "No abstract provided."}
                </p>

                <footer className="flex items-center space-x-6 text-sm text-gray-500">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                      <span className="text-[10px] font-medium text-gray-600">0x</span>
                    </div>
                    <span className="font-medium text-gray-700">{identityLabel(a.author)}</span>
                  </div>
                  <span>&bull;</span>
                  <time>{new Date(a.submit_timestamp ?? a.created_at).toLocaleDateString()}</time>
                  {a.version > 1 && (
                    <>
                      <span>&bull;</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">v{a.version}</span>
                    </>
                  )}
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
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-10">
          <button
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => goToPage(p)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                p === page ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
