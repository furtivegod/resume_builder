/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow opening the dev server via LAN IP (e.g. http://192.168.x.x:3000)
  allowedDevOrigins: ["192.168.4.201", "localhost", "127.0.0.1"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

