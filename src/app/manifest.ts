import type { MetadataRoute } from "next";

// Lets you "Add to Home Screen" on iPhone and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Creator HQ",
    short_name: "Creator HQ",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#6d28d9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
