import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next.js to not bundle these Node.js-only packages (used by better-auth)
  serverExternalPackages: ["@node-rs/argon2", "@node-rs/bcrypt"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
