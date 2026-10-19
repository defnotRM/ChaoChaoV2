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
        source: "/renter/hireproduct",
        destination: "/products",
        permanent: true,
      },
      {
        source: "/renter/hireproduct/:id",
        destination: "/product/:id",
        permanent: true,
      },
      {
        source: "/renter/hireproduct/:id/booking",
        destination: "/product/:id/rent",
        permanent: true,
      },
      {
        source: "/renter/hireproduct/:id/request",
        destination: "/product/:id/rent",
        permanent: true,
      },
      {
        source: "/product/:id/request",
        destination: "/product/:id/rent",
        permanent: true,
      },
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
