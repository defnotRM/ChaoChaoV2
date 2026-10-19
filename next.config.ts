import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
    ];
  },
};

export default nextConfig;
