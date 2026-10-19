// PWA Runtime Caching Configuration for DFA Visualizer
// Cache version is automatically read from public/VERSION.txt
const fs = require('fs');
const path = require('path');

// Read version from VERSION.txt file
let APP_VERSION = '0.1.0'; // Fallback version
try {
  const versionPath = path.join(__dirname, 'public', 'VERSION.txt');
  APP_VERSION = fs.readFileSync(versionPath, 'utf8').trim();
} catch (error) {
  console.warn('⚠️  Could not read VERSION.txt, using fallback version:', APP_VERSION);
}

const CACHE_VERSION = `v${APP_VERSION}`;
const PROJECT_PREFIX = 'dfa-viz';

// Time constants
const ONE_DAY = 60 * 60 * 24;
const ONE_MONTH = ONE_DAY * 30;
const ONE_YEAR = ONE_DAY * 365;

// Get base URLs from environment variables
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const BASE_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
const USE_API_PROXY = process.env.NEXT_PUBLIC_ENABLE_API_PROXY === 'true';

// Pre-compute origin for use in service worker
// IMPORTANT: Only use this in RegExp patterns, NOT in urlPattern functions.
// workbox serializes functions via .toString() which drops closure variables,
// causing "ReferenceError: API_ORIGIN is not defined" at runtime in the SW.
const API_ORIGIN = new URL(BASE_API_URL).origin;

// Escape special regex chars so the origin is safe inside a RegExp
const escapedApiOrigin = API_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

console.log('🔧 PWA Cache Config - APP_VERSION:', APP_VERSION);
console.log('🔧 PWA Cache Config - CACHE_VERSION:', CACHE_VERSION);
console.log('🔧 PWA Cache Config - BASE_URL:', BASE_URL);
console.log('🔧 PWA Cache Config - API_BASE_URL:', BASE_API_URL);
console.log('🔧 PWA Cache Config - API_ORIGIN:', API_ORIGIN);
console.log('🔧 PWA Cache Config - USE_API_PROXY:', USE_API_PROXY);

const runtimeCaching = [
  // VERSION.txt - NetworkOnly (for version checking)
  {
    urlPattern: /\/VERSION\.txt$/i,
    handler: 'NetworkOnly',
    options: {},
  },

  // Google Fonts - CacheFirst strategy (rarely changes)
  {
    urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-google-fonts-${CACHE_VERSION}`,
      expiration: { 
        maxEntries: 20, 
        maxAgeSeconds: ONE_YEAR 
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Images - CacheFirst strategy (static assets)
  {
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-images-${CACHE_VERSION}`,
      expiration: { 
        maxEntries: 200, 
        maxAgeSeconds: ONE_MONTH 
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // CSS & JS static assets - CacheFirst (serve from cache, update only on new deployment)
  {
    urlPattern: /\.(?:css|js)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-static-${CACHE_VERSION}`,
      expiration: { 
        maxEntries: 100, 
        maxAgeSeconds: ONE_YEAR
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Fonts - CacheFirst (local fonts)
  {
    urlPattern: /\.(?:woff|woff2|ttf|otf)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: `${PROJECT_PREFIX}-fonts-${CACHE_VERSION}`,
      expiration: { 
        maxEntries: 30, 
        maxAgeSeconds: ONE_YEAR 
      },
      cacheableResponse: { statuses: [0, 200] },
    },
  },

  // Authentication endpoints - NetworkOnly (NEVER cache auth data for security)
  // Matches proxy mode: /api/proxy/auth/* AND direct mode: API_ORIGIN/auth/*
  // Uses RegExp (not a function) because workbox serializes functions via .toString(),
  // which drops closure variables and causes ReferenceError in the service worker.
  {
    urlPattern: new RegExp(
      `(^${escapedApiOrigin}/auth/|/api/proxy/auth/)`, 'i'
    ),
    handler: 'NetworkOnly',
    options: {},
  },

  // API responses - NetworkOnly (requests carry per-call Ed25519 signatures;
  // cached responses would have stale timestamps and mismatched paths/query params)
  // Matches proxy mode: /api/proxy/* AND direct mode: API_ORIGIN/*
  // Auth paths are already captured by the route above (workbox uses first-match routing).
  {
    urlPattern: new RegExp(
      `(^${escapedApiOrigin}/|/api/proxy/)`, 'i'
    ),
    handler: 'NetworkOnly',
    options: {},
  },

  // Next.js data files - NetworkOnly
  {
    urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
    handler: 'NetworkOnly',
    options: {},
  },

  // Document requests - NetworkOnly (prioritize fresh content)
  {
    urlPattern: ({ request }) => request.destination === 'document',
    handler: 'NetworkOnly',
    options: {},
  },
];

// Export for both CommonJS and ES6 modules
module.exports = runtimeCaching;
