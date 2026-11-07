/** @type {import('next').NextConfig} */
const nextConfig = {
  // Rendering libraries ship native binaries / dynamic requires; keep them out of the bundle.
  serverExternalPackages: ['playwright-core', 'ffmpeg-static'],
  experimental: {
    // proxy.js (password gate) buffers request bodies and silently truncates them past
    // this size (default 10MB), which would corrupt phone-video uploads.
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
