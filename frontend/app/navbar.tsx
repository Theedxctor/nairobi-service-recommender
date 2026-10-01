"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 bg-stone-50/90 backdrop-blur transition-shadow ${
        scrolled ? "border-b border-stone-200 shadow-sm" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-heading text-xl font-semibold tracking-tight text-stone-900">
          Nai<span className="text-teal-700">Serve</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900">
            Login
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}
