"use client";

import Link from "next/link";
import { BookOpenText, LogOut } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };
  
  return (
    <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 transition-colors">
              <BookOpenText className="w-6 h-6" />
              <span className="font-bold text-xl tracking-tight text-gray-900">DeSci Pub</span>
            </Link>
            
            <div className="hidden md:flex space-x-6">
              <Link href="/articles" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Explore Articles</Link>
              <Link href="/author/submit" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Submit Manuscript</Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            ) : (
              <Link href="/login" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Login</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
