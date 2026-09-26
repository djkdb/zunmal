/*
 * 말랑 뽑기방 서비스 워커 — 홈 화면 앱이 오프라인에서도 열리도록 한다.
 *  - 페이지(index.html): 네트워크 우선, 실패하면 캐시 (새 버전이 바로 반영되도록)
 *  - 빌드 파일(assets/…, 해시 이름): 캐시 우선 (이름이 바뀌면 새 파일)
 *  - 글꼴(jsdelivr): 캐시 우선
 * 구조를 바꾸면 VERSION을 올린다. 이전 버전 캐시는 activate 때 지운다.
 */
const VERSION = 'v1';
const CACHE = `malang-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('malang-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isFont) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
