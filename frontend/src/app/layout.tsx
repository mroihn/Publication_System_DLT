import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { AuthProvider } from "@/core/context/AuthContext";
import { ToastProvider } from "@/core/context/ToastContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "DeSci - Web3 Academic Publishing",
  description: "A decentralized platform for academic publishing and peer review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        <ToastProvider>
          <AuthProvider>
            <Navbar />
          <main className="flex-grow flex flex-col pt-16">
            {children}
          </main>
          <Footer />
        </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
