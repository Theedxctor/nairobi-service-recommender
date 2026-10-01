"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutIcon, MenuIcon, XIcon } from "../icons";
import { NAV_CONFIG } from "../nav-config";
import { clearAuth, readAuth, ROLE_HOME, type NaiserveAuth } from "../use-auth-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState<NaiserveAuth | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Re-read on every navigation so the sidebar updates instantly after login/logout.
  useEffect(() => {
    setAuth(readAuth());
    setDrawerOpen(false);
  }, [pathname]);

  const items = auth ? NAV_CONFIG[auth.role] : [];
  const homeHref = auth ? ROLE_HOME[auth.role] : "/";

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
        <Link href={homeHref} className="font-heading text-xl font-semibold text-stone-900">
          Nai<span className="text-teal-700">Serve</span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="text-stone-400 hover:text-stone-600 md:hidden"
          aria-label="Close menu"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-teal-700 bg-teal-50 text-teal-800"
                  : "border-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-stone-200 p-4">
        {auth && (
          <Link
            href="/profile"
            className="mb-1 block rounded-md px-2 py-2 transition-colors hover:bg-stone-50"
          >
            <p className="truncate text-sm font-semibold text-stone-900">{auth.name || "Account"}</p>
            <span className="mt-1 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs font-medium capitalize text-stone-600">
              {auth.role}
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 hover:text-red-700"
        >
          <LogoutIcon className="h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      {/* Desktop sidebar: fixed/persistent */}
      <aside className="hidden border-r border-stone-200 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
        <Link href={homeHref} className="font-heading text-lg font-semibold text-stone-900">
          Nai<span className="text-teal-700">Serve</span>
        </Link>
        <button type="button" onClick={() => setDrawerOpen(true)} className="text-stone-600" aria-label="Open menu">
          <MenuIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile slide-out drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebarContent}</div>
        </div>
      )}

      <main className="flex-1 md:ml-64">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
