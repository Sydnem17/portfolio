/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep these as runtime requires on the server so their WASM / native assets load correctly.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "sharp"],
  },
  images: { unoptimized: true },
};
export default nextConfig;
