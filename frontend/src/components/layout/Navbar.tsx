"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenText, Menu, X } from "lucide-react";
import { useAuth } from "@/core/context/AuthContext";

type NavLink = { href: string; label: string };

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setOpen(false);
    router.push("/login");
  };

  const common: NavLink[] = [
    { href: "/articles", label: "Explore" },
    { href: "/tracker", label: "Tracker" },
  ];

  const authed: NavLink[] = [
    { href: "/author/submit", label: "Submit" },
    { href: "/author/revise", label: "Revise" },
    ...(user?.role === "reviewer"
      ? [
          { href: "/reviewer/assignments", label: "Assignments" },
          { href: "/reviewer/specialization", label: "Specialization" },
          { href: "/reviewer/earnings", label: "Earnings" },
        ]
      : []),
    ...(user?.role === "user" ? [{ href: "/reviewer/specialization", label: "Become a Reviewer" }] : []),
    ...(user?.role === "editor" ? [{ href: "/editor", label: "Editor" }] : []),
    { href: "/profile", label: "Profile" },
  ];

  const links = isAuthenticated ? [...common, ...authed] : common;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href="/"
              className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 transition-colors flex-shrink-0"
            >
              <BookOpenText className="w-6 h-6" />
              <span className="font-bold text-xl tracking-tight text-gray-900">DeSci Pub</span>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(l.href)
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  {user?.email && (
                    <span className="text-xs text-gray-400 max-w-[160px] truncate hidden xl:inline">
                      {user.email}
                      {user.role && user.role !== "user" ? ` · ${user.role}` : ""}
                    </span>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Toggle navigation"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-2 mt-2 border-t border-gray-100">
            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Logout
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
