import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NaiServe | Reliable service providers in Nairobi",
  description:
    "Context-aware matching that ranks Nairobi service providers by real arrival reliability, not just proximity.",
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
      </body>
    </html>
  );
}



