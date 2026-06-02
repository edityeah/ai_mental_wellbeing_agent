/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    typedRoutes: true,
  },
  // Standalone output bundles only the runtime files needed to serve
  // the app — keeps the Docker image small (~150MB instead of ~1GB)
  // and the production start command simple (`node server.js`).
  output: "standalone",
};

export default nextConfig;
