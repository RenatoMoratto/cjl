// Offline support. Registered from _app.tsx as /sw.js?build=<buildId>, so each
// deploy installs a new worker with its own app cache.
const BUILD = new URL(self.location.href).searchParams.get("build") ?? "dev";
const APP_CACHE = `cjl-app-${BUILD}`; // HTML, JS/CSS chunks and images of this build
const DATA_CACHE = "cjl-data"; // song list and agenda, kept across deploys
const SONGS_CACHE = "cjl-songs"; // offline songs, managed by useOfflineSongs

// The public pages available offline. They are statically prerendered, so all
// URLs of a dynamic route get the same HTML: each route is cached once, under
// the URL fetched at install, and served for every URL that matches it.
// Anything else (admin, sign-in, other routes) is left to the network.
const ROUTES = [
  { pattern: /^\/$/, url: "/" },
  { pattern: /^\/kits$/, url: "/kits" },
  { pattern: /^\/kits\/[^/]+$/, url: "/kits/soprano" }, // /kits/[voz]
  { pattern: /^\/kits\/[^/]+\/[^/]+$/, url: "/kits/soprano/1" }, // /kits/[voz]/[musica]
  { pattern: /^\/agenda$/, url: "/agenda" },
];

function pageKey(pathname) {
  return ROUTES.find((route) => route.pattern.test(pathname))?.url ?? null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await Promise.all(
        ROUTES.map(async ({ url }) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (!response.ok) throw new Error(`Failed to cache ${url}`);
          const html = await response.clone().text();
          await cache.put(url, response);
          const assets = html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [];
          await cache.addAll([...new Set(assets)]);
        }),
      );
      // Best effort: these come from the database, and a slow or failing query
      // must not stop the pages from installing. They are cached on visit too.
      const data = await caches.open(DATA_CACHE);
      await Promise.all(
        ["/api/musicas", "/api/agenda"].map((path) =>
          data.add(path).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cjl-app-") && key !== APP_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Voice kits are served from R2, on another origin
  if (url.pathname.endsWith(".mp3")) {
    event.respondWith(serveSong(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const key = pageKey(url.pathname);
    if (key) event.respondWith(networkFirst(request, APP_CACHE, key, 3000));
  } else if (
    url.pathname === "/api/musicas" ||
    url.pathname === "/api/agenda"
  ) {
    event.respondWith(networkFirst(request, DATA_CACHE, url.pathname));
  } else if (url.pathname.startsWith("/api/musicas/")) {
    // Only offline songs have their lyrics cached (by useOfflineSongs).
    event.respondWith(networkFirst(request, null, request));
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/images/")
  ) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request, cacheName, cacheKey, timeout) {
  const network = fetch(request).then((response) => {
    if (cacheName && response.ok) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(cacheKey, copy));
    }
    return response;
  });
  network.catch(() => {});

  try {
    const response = await (timeout
      ? Promise.race([
          network,
          new Promise((_, reject) => setTimeout(reject, timeout)),
        ])
      : network);
    // A server that fails is no more use than no network: keep the copy
    if (response.status >= 500)
      return (await caches.match(cacheKey)) ?? response;
    return response;
  } catch {
    // Offline or slow network: use the cache, otherwise keep waiting.
    return (await caches.match(cacheKey)) ?? network;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

// A song opened for the first time is saved offline while it plays, so its
// later ranges (after a seek, or a pause long enough for the browser to drop
// the download) come from the cache, as responses made here. The browser
// rejects a file whose ranges come from different origins, and would stop
// with an error, so ranges from the network are served as responses made here
// too. That needs R2's CORS policy (scripts/configure-r2-cors.ts); where it is
// missing songs can't be saved offline either, so the plain request is safe.
async function fetchSong(request) {
  const range = request.headers.get("range");
  let response;
  try {
    response = await fetch(request.url, { headers: range ? { range } : {} });
  } catch {
    return fetch(request);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// Audio elements request byte ranges (Safari won't play without 206
// responses), so ranges are sliced from the cached file. Kit URLs are
// immutable (a replaced kit gets a new URL), so a cached copy never goes stale.
async function serveSong(request) {
  // useOfflineSongs downloads with cache: "reload" to bypass the cached copy.
  if (request.cache === "reload") return fetch(request);

  const cache = await caches.open(SONGS_CACHE);
  const cached = await cache.match(request.url);
  if (!cached) return fetchSong(request);

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range) return cached;

  const blob = await cached.blob();
  const size = blob.size;
  let start = Number(range[1]);
  let end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (range[1] === "") {
    start = Math.max(size - Number(range[2]), 0);
    end = size - 1;
  }

  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") ?? "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
