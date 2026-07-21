import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/^\/api\/integrations\/microsoft\/callback(?:\?|$)/],
    },
  },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['argon2'],
};

export default nextConfig;
