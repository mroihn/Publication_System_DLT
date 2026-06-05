import Link from "next/link";
import { BookOpen, FileText, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 bg-white">
      {/* Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 tracking-tight mb-6">
          Advancing Science Through <span className="text-indigo-600">Decentralization</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-3xl mb-10 leading-relaxed">
          A transparent, immutable, and peer-reviewed publishing platform designed for the modern academic community. Share your research with the world securely.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/articles"
            className="inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Explore Publications
          </Link>
          <Link
            href="/author/submit"
            className="inline-flex justify-center items-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Submit Manuscript
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full bg-gray-50 border-t border-gray-200 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Open Access</h3>
              <p className="text-gray-600">
                Research should be free and accessible to everyone. Our platform ensures that all published work remains open access permanently.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Transparent Peer Review</h3>
              <p className="text-gray-600">
                Fostering accountability and constructive feedback through an open and verifiable peer-review process.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Immutable Records</h3>
              <p className="text-gray-600">
                Powered by Web3 technology, establishing verifiable and permanent records of authorship and publication dates.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
