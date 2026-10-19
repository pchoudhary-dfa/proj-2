/**
 * PWA runtime caching configuration for DFA Data Manager.
 *
 * This is the single file to manage WHAT gets cached and HOW (strategy, TTL, limits).
 * Rules are evaluated top-to-bottom; first match wins.
 *
 * Cache bucket names include a version suffix from root `VERSION.txt` (e.g. `dfa-dm-images-v6.0.6`).
 * Bump `VERSION.txt` on release to invalidate old buckets.
 *
 * Precache (install-time) is handled by next-pwa from the Next.js build + `public/`.
 * Exclude paths from precache via `publicExcludes` in `next.config.ts`.
 */
const fs = require('fs');
const path = require('path');

let APP_VERSION = '0.1.0';
try {
  const versionPath = path.join(__dirname, 'VERSION.txt');
  APP_VERSION = fs.readFileSync(versionPath, 'utf8').trim();
} catch (error) {
  console.warn('⚠️  Could not read VERSION.txt, using fallback version:', APP_VERSION);
}

const CACHE_VERSION = `v${APP_VERSION}`;
const PROJECT_PREFIX = 'dfa-dm';

const ONE_DAY = 60 * 60 * 24;
const ONE_MONTH = ONE_DAY * 30;
const ONE_YEAR = ONE_DAY * 365;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BASE_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
// Embed origin as a RegExp literal — workbox serializes urlPattern functions and drops closures.
const API_ORIGIN = new URL(BASE_API_URL).origin;
const escapedApiOrigin = API_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedBaseUrl = BASE_URL.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

console.log('🔧 PWA Cache Config - APP_VERSION:', APP_VERSION);
console.log('🔧 PWA Cache Config - CACHE_VERSION:', CACHE_VERSION);
console.log('🔧 PWA Cache Config - BASE_URL:', BASE_URL);
console.log('🔧 PWA Cache Config - API_BASE_URL:', BASE_API_URL);
console.log('🔧 PWA Cache Config - API_ORIGIN:', API_ORIGIN);

const runtimeCaching = [
  // App version API — always fresh (used for client-side cache cleanup / version display)
  {
    urlPattern: /\/api\/version$/i,
    handler: 'NetworkOnly',
    options: {},
  },

  // Google Fonts — CacheFirst (rarely changes)
  {
    urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-google-fonts-${CACHE_VERSION}`,
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: ONE_YEAR,
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Images — CacheFirst (static assets under /images, /icons, etc.)
  {
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-images-${CACHE_VERSION}`,
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: ONE_MONTH,
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // CSS & JS — CacheFirst (served from cache; new deploy + VERSION bump refreshes)
  {
    urlPattern: /\.(?:css|js)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-static-${CACHE_VERSION}`,
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: ONE_YEAR,
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Local fonts — CacheFirst
  {
    urlPattern: /\.(?:woff|woff2|ttf|otf)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-fonts-${CACHE_VERSION}`,
      expiration: {
        maxEntries: 30,
        maxAgeSeconds: ONE_YEAR,
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Auth — NetworkOnly (never cache login/logout/refresh)
  // DataManager browser traffic: dedicated BFF handlers at /api/auth/* (not /api/backend/auth/*).
  // Direct {API_ORIGIN}/auth/* kept as a safety net for any cross-origin toolkit calls.
  {
    urlPattern: new RegExp(
      `(^${escapedApiOrigin}/auth/|/api/auth/)`,
      'i'
    ),
    handler: 'NetworkOnly',
    options: {},
  },

  // Toolkit API — NetworkOnly (signed BFF requests; cached responses would have stale timestamps)
  // DataManager browser traffic always uses /api/backend/* regardless of NEXT_PUBLIC_ENABLE_API_PROXY.
  // That env flag does not switch the browser to /api/proxy/* (legacy visualizer pattern).
  // Direct {API_ORIGIN}/* kept as a safety net only.
  {
    urlPattern: new RegExp(
      `(^${escapedApiOrigin}/|/api/backend/)`,
      'i'
    ),
    handler: 'NetworkOnly',
    options: {},
  },

  // Next.js RSC/data JSON — NetworkOnly
  {
    urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
    handler: 'NetworkOnly',
    options: {},
  },

  // HTML under app origin — NetworkOnly
  {
    urlPattern: new RegExp(`^${escapedBaseUrl}/.*$`, 'i'),
    handler: 'NetworkOnly',
    options: {},
  },

  // Document navigations — NetworkOnly (offline → fallback.html via next-pwa)
  {
    urlPattern: ({ request }) => request.destination === 'document',
    handler: 'NetworkOnly',
    options: {},
  },
];

module.exports = runtimeCaching;
