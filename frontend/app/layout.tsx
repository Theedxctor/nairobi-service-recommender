import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nairobi Household Service Provider Recommender",
  description: "Context-Aware Service Provider Reliability & Recommendation System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-indigo-600">
                Nairobi<span className="text-slate-800">Services</span>
              </span>
              <span className="text-xs bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded border border-indigo-100">
                Context-Aware AI
              </span>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <a href="/request" className="hover:text-indigo-600 transition-colors">
                Request Service
              </a>
              <a href="/results" className="hover:text-indigo-600 transition-colors">
                Recommendations
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
