import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "awnwvckyjkkuhufmdgas.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/rental/:id/confrim-return",
        destination: "/rental/:id/confirm-return",
        permanent: true,
      },
      {
        source: "/rental/:id/confirm-recieve",
        destination: "/rental/:id/confirm-receive",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
