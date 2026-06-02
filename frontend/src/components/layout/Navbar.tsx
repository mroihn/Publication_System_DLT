import Link from "next/link";
import ConnectWallet from "../shared/ConnectWallet";
import { BookOpenText } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 transition-colors">
              <BookOpenText className="w-6 h-6" />
              <span className="font-bold text-xl tracking-tight">DeSci Pub</span>
            </Link>
            
            <div className="hidden md:flex space-x-6">
              <Link href="/articles" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Explore Articles</Link>
              <Link href="/author/submit" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Submit Manuscript</Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <ConnectWallet />
          </div>
        </div>
      </div>
    </nav>
  );
}
