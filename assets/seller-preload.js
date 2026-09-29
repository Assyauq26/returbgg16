(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const API_URL = cfg.API_URL;
  const CACHE_KEY = 'retur-bgg16:sellers:v2';
  const TTL = 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let refreshPromise = null;

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.sellers)) return null;
      return data;
    } catch (_) { return null; }
  }

  function writeCache(sellers) {
    if (!Array.isArray(sellers)) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), sellers })); } catch (_) {}
  }

  function responseFor(sellers) {
    return new Response(JSON.stringify({ ok: true, data: sellers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function refresh() {
    if (!API_URL || refreshPromise) return refreshPromise;
    refreshPromise = nativeFetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getSellers' }),
      cache: 'no-store'
    }).then(r => r.json()).then(payload => {
      if (!payload?.ok || !Array.isArray(payload.data)) throw new Error('Seller response invalid');
      writeCache(payload.data);
      return payload.data;
    }).catch(() => null).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const body = init?.body;
      if (API_URL && url === API_URL && typeof body === 'string') {
        const payload = JSON.parse(body);

        if (payload?.action === 'getSellers') {
          const cached = readCache();
          if (cached?.sellers?.length) {
            refresh();
            return responseFor(cached.sellers);
          }
          const response = await nativeFetch(input, init);
          response.clone().json().then(data => {
            if (data?.ok && Array.isArray(data.data)) writeCache(data.data);
          }).catch(() => {});
          return response;
        }

        if (payload?.action === 'addSeller') {
          const response = await nativeFetch(input, init);
          response.clone().json().then(data => {
            if (data?.ok && data.data?.name) {
              const cached = readCache();
              const sellers = cached?.sellers || [];
              const exists = sellers.some(s => String(s.name).toLowerCase() === String(data.data.name).toLowerCase());
              if (!exists) writeCache([...sellers, data.data]);
            }
          }).catch(() => {});
          return response;
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };
})();
