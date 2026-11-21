// Service worker de l'app Épicerie — NE BLOQUE JAMAIS l'affichage.
// 1) Toujours servir la copie du téléphone (cache d'abord) : ouverture instantanée, même sans réseau ou réseau qui « pend ».
// 2) La mise à jour est faite par la page (index.html : checkUpdate) qui écrit dans le même cache « epicerie-app ».
//    (Ancien chemin par message conservé pour compatibilité.) Délais maximaux ;
//    la nouvelle liste ne remplace l'ancienne que si elle a été téléchargée au complet.
const CACHE = 'epicerie-app';
const FILES = ['./', './manifest.webmanifest', './icon-180.png', './icon-512.png'];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('délai')), ms))]);
const fetchT = (url, ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: c.signal }); };
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('version.json') || u.searchParams.has('fresh')) return;  // ?fresh= : téléchargement direct par la page
  const key = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then(hit => hit ||
    fetchT(e.request, 8000).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(key, c)); } return r; })));
});
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'update') return;
  const port = e.ports[0], reply = m => port && port.postMessage(m);
  e.waitUntil(withTimeout(fetchT('version.json', 6000).then(r => r.json()), 7000).then(v => {
    if (v.version === e.data.current) return reply({ status: 'same' });
    return withTimeout(fetchT('./', 45000).then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      if (html.length < 10000 || !html.includes(v.version)) throw new Error('incomplet');
      const c = await caches.open(CACHE);
      await c.put('./', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      reply({ status: 'updated', version: v.version });
    }), 50000);
  }).catch(err => reply({ status: 'offline', error: String(err) })));
});
