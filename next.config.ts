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
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb", // briefs and contracts up to 25 MB
    },
  },
};

export default nextConfig;
