import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Addresses from the earlier, larger version of the site still work.
  async redirects() {
    return [
      { source: "/history", destination: "/me", permanent: false },
      { source: "/settings", destination: "/me/settings", permanent: false },
      { source: "/metrics", destination: "/me/metrics", permanent: false },
      { source: "/profile/edit", destination: "/me/edit", permanent: false },
      { source: "/annual", destination: "/doctor/year", permanent: false },
      { source: "/episodes/new", destination: "/", permanent: false },
      { source: "/followups/new", destination: "/after", permanent: false },
      { source: "/episodes/:id/summary", destination: "/doctor/:id", permanent: false },
      { source: "/episodes/:id/visit", destination: "/after?episode=:id", permanent: false },
    ];
  },
};

export default nextConfig;
