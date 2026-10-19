import type { NextConfig } from "next";

// `output: "standalone"` traces files into `.next/standalone`. On native Windows,
// Next/Turbopack can emit chunk paths containing `:` (e.g. `[externals]_node:crypto_…`),
// which makes `copyfile` fail with EINVAL. Linux/macOS (including Docker build stages)
// are unaffected — Dockerfile.oci still gets a full standalone output in the builder.
const nextConfig: NextConfig = {
  ...(process.platform !== "win32" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  transpilePackages: [
    "@dfa-v6/styleguide",
    "@dfa/dfa-help-renderer",
    "dfa-help-admin",
    "dfa-mailer-templates",
    "dfa-v6-comp-area",
    "dfa-v6-comp-treeview",
    "dfa-v6-comp-list-view",
    "dfa-v6-comp-indicator",
    "dfa-v6-comp-timeperiod",
  ],
};

// next-pwa injects a webpack config; only apply in production so `next dev` uses Turbopack.
// Production builds use `next build --webpack` (see package.json).
// Runtime cache rules: runtimeCaching.js | precache exclusions: publicExcludes below.
function withProductionPWA(config: NextConfig): NextConfig {
  const runtimeCaching = require("./runtimeCaching.js");
  const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED !== "false";

  const withPWA = require("next-pwa")({
    dest: "public",
    register: false,
    skipWaiting: false,
    disable: !PWA_ENABLED,
    runtimeCaching,
    // Paths under public/ to exclude from install-time precache (add large or private assets here).
    publicExcludes: [],
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
      document: "/fallback.html",
    },
  });

  return withPWA(config);
}

export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withProductionPWA(nextConfig);
