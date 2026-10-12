import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallPrompt from "./install-prompt";

export const metadata: Metadata = {
  title: "NaiServe | Reliable service providers in Nairobi",
  description:
    "Context-aware matching that ranks Nairobi service providers by real arrival reliability, not just proximity.",
  applicationName: "NaiServe",
  // iOS: open full-screen from the home screen, under the name "NaiServe" (#93).
  // The manifest (app/manifest.ts) and icons are linked by Next automatically.
  appleWebApp: { capable: true, title: "NaiServe", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e", // teal-700: colours the phone's status bar
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}



