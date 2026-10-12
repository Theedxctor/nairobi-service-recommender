import type { MetadataRoute } from "next";

// Web app manifest (#93): lets a phone add NaiServe to its home screen and
// open it full-screen, without the browser's address bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NaiServe",
    short_name: "NaiServe",
    description: "Reliable household service providers in Nairobi, ranked by predicted arrival reliability.",
    // Signed-out users are sent on to /login, and each role to its own home.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9", // stone-50, the page background
    theme_color: "#0f766e", // teal-700
    lang: "en",
    categories: ["lifestyle", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
