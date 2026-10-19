import type { NextConfig } from "next";

// Import runtime caching configuration from separate file
const runtimeCaching = require('./runtimeCaching.js');

// PWA Configuration - Controlled by environment variables
const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED !== 'false'; // Default: true (enabled)
const PWA_CACHING_ENABLED = process.env.NEXT_PUBLIC_CACHE_ENABLED !== 'false'; // Default: true (enabled)

// Configure PWA with next-pwa
const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // We handle registration in PWARegister component for better control
  skipWaiting: false,
  disable: !PWA_ENABLED || process.env.NODE_ENV === 'development',
  runtimeCaching: PWA_CACHING_ENABLED ? runtimeCaching : [],
  cleanupOutdatedCaches: true,
  buildExcludes: [
    /middleware-manifest\.json$/,
    /proxy-manifest\.json$/,
    /build-manifest\.json$/,
    /app-build-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
    /\/fallback.*\.js$/,
  ],
  cacheStartUrl: false,
  fallbacks: {
    document: '/fallback.html',
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Use project root for file tracing when multiple lockfiles exist (avoids "handler is not a function")
  outputFileTracingRoot: process.cwd(),
  // Ensure xlsx is available for dynamic import (export) and included in standalone trace
  serverExternalPackages: ["xlsx"],
  // Resolve and transpile workspace packages so they can be bundled
  transpilePackages: [
    "@dfa-v6/styleguide",
    "dfa-v6-comp-visualization",
    "dfa-v6-comp-area",
    "dfa-v6-comp-indicator",
    "dfa-v6-comp-list-view",
    "dfa-v6-comp-kw-search",
    "dfa-v6-comp-subgroup",
    "dfa-v6-comp-timeperiod",
    "dfa-v6-comp-treeview",
  ],
};

export default withPWA(nextConfig);
