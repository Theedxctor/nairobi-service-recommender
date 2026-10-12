"use client";

import { useEffect, useState } from "react";

// Installing NaiServe to the home screen (#93). Android and desktop Chrome/Edge
// fire `beforeinstallprompt`, which lets us offer an Install button. iOS Safari
// has no such event, so there we explain the Share > Add to Home Screen steps.

/** Chrome's install event; not in the standard DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "naiserve_install_dismissed";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS Safari's own flag for a site opened from the home screen.
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIosSafari = () => {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    // The offline page needs the service worker. Skipped in development,
    // where a worker gets in the way of hot reloading.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Storage blocked: the prompt simply shows again next visit.
    }
    if (dismissed || isStandalone()) return;

    if (isIosSafari()) setShowIosSteps(true);

    const onPrompt = (event: Event) => {
      event.preventDefault(); // keep the browser's own mini-bar from showing
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setShowIosSteps(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do: it is hidden for this visit either way.
    }
    setInstallEvent(null);
    setShowIosSteps(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    // The event can only be used once, whichever way the user answered.
    setInstallEvent(null);
  };

  if (!installEvent && !showIosSteps) return null;

  return (
    <aside
      aria-label="Install NaiServe"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-semibold text-stone-900">Add NaiServe to your home screen</p>
          {installEvent ? (
            <p className="mt-0.5 text-sm text-stone-600">Open it like an app, full screen, straight from your phone.</p>
          ) : (
            <p className="mt-0.5 text-sm text-stone-600">
              Tap the <span className="font-semibold text-stone-900">Share</span> button in Safari, then{" "}
              <span className="font-semibold text-stone-900">Add to Home Screen</span>.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {installEvent && (
              <button
                type="button"
                onClick={install}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              {installEvent ? "Not now" : "Got it"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
