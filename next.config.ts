import type { NextConfig } from "next";

// Every page in this app is personal and changes often, so pages render fresh
// on each request (Cache Components is off on purpose).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Invoice PDFs read these font files from disk, so ship them with every route.
  outputFileTracingIncludes: {
    "/**": ["./src/assets/fonts/**"],
  },
  experimental: {
    // Pages you've just seen open instantly when you go back to them. Any change
    // you make clears this, so you never see stale numbers after an edit.
    staleTimes: {
      dynamic: 30,
      static: 120,
    },
    serverActions: {
      bodySizeLimit: "26mb", // briefs and contracts up to 25 MB
    },
  },
};

export default nextConfig;
