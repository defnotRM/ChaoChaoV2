import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
