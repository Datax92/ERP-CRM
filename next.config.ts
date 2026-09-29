import type { NextConfig } from "next";

// Static export: the app talks to Firebase directly from the browser, so it can be
// served from Firebase Hosting (free tier) or any static host.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Lets the dev server be opened via 127.0.0.1 or from a phone on the same Wi-Fi.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
};

export default nextConfig;
