import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// --- NEW: Initialize Serwist ---
const withSerwist = withSerwistInit({
  // This tells Serwist where our custom worker file will live
  swSrc: "src/app/sw.ts",
  // This is where Serwist will generate the final worker file 
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development", // Optional: disables PWA spam in dev mode
});

const nextConfig: NextConfig = {
  experimental: {
    // turbopackFileSystemCacheForBuild was disabled — its persistent cache intermittently
    // dropped Node-runtime API routes (/api/chat, /api/v1/*) from the dev route tree, causing
    // hard-to-debug 404s. Re-enable only if builds need it and the route-registration bug is
    // confirmed fixed upstream.
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/sitemap.xml",
        destination: "/api/sitemap-index",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://*.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data: blob: https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Wrap the config in both the Intl plugin AND the Serwist plugin
export default withSerwist(withNextIntl(nextConfig));