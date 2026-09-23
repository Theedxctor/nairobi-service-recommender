import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mtaa | Reliable help, close to home",
  description: "Find trusted household service providers across Nairobi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b bg-[#fffdf8]/95 backdrop-blur" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <a href="/" className="text-2xl font-bold tracking-tight" style={{ color: "var(--green)" }}>mtaa<span style={{ color: "var(--ink)" }}>.</span></a>
            <nav className="hidden items-center gap-7 text-sm font-bold md:flex" style={{ color: "var(--muted)" }}>
              <a href="/request" className="hover:text-[#176b4d]">Find a provider</a>
              <a href="/dashboard" className="hover:text-[#176b4d]">My bookings</a>
              <a href="/provider/dashboard" className="hover:text-[#176b4d]">For providers</a>
            </nav>
            <div className="flex items-center gap-2"><a href="/login" className="hidden px-3 py-2 text-sm font-bold md:block">Log in</a><a href="/register" className="btn-primary px-4 py-2">Get started</a></div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t px-5 py-8" style={{ borderColor: "var(--line)" }}><div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 text-sm md:flex-row" style={{ color: "var(--muted)" }}><span className="font-bold" style={{ color: "var(--green)" }}>mtaa.</span><span>Reliable help, close to home. Nairobi, Kenya.</span></div></footer>
      </body>
    </html>
  );
}
