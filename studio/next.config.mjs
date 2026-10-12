import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Chromium binary + brand fonts are only needed by the two rendering routes;
// globs resolve from this folder (the Next.js project root).
const renderFiles = ['../deploy/fonts/**', 'node_modules/@sparticuz/chromium/bin/**'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright-core', 'ffmpeg-static', '@sparticuz/chromium'],
  // Vercel deploys trace files per route; the repo root is the tracing root so the
  // brand folders and fonts that live outside studio/ ship with the functions too.
  outputFileTracingRoot: path.join(dir, '..'),
  outputFileTracingIncludes: {
    '/**': ['brands/**', '../@pickydoggyclub/**'],
    '/api/posts/**': renderFiles,
  },
};

export default nextConfig;
