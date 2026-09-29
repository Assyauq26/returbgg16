(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const API_URL = cfg.API_URL;
  const CACHE_KEY = 'retur-bgg16:sellers:v2';
  const RETURN_CACHE_KEY = 'retur-bgg16:return-sellers:v2';
  const TTL = 24 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let refreshPromise = null;
  let returnRefreshPromise = null;

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.sellers)) return null;
      if (data.savedAt && Date.now() - data.savedAt > TTL) return null;
      return data;
    } catch (_) { return null; }
  }

  function writeCache(key, sellers) {
    if (!Array.isArray(sellers)) return;
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), sellers })); } catch (_) {}
  }

  function responseFor(sellers) {
    return new Response(JSON.stringify({ ok: true, data: sellers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function refreshMasterSellers() {
    if (!API_URL || refreshPromise) return refreshPromise;
    refreshPromise = nativeFetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getSellers' }),
      cache: 'no-store'
    }).then(r => r.json()).then(payload => {
      if (!payload?.ok || !Array.isArray(payload.data)) throw new Error('Seller response invalid');
      writeCache(CACHE_KEY, payload.data);
      return payload.data;
    }).catch(() => null).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function refreshReturnSellers() {
    if (!API_URL || returnRefreshPromise) return returnRefreshPromise;
    returnRefreshPromise = nativeFetch(`${API_URL}?action=getReturnSellers`, {
      method: 'GET',
      cache: 'no-store'
    }).then(r => r.json()).then(payload => {
      if (!payload?.ok || !Array.isArray(payload.data)) throw new Error('Return seller response invalid');
      writeCache(RETURN_CACHE_KEY, payload.data);
      return payload.data;
    }).catch(() => null).finally(() => { returnRefreshPromise = null; });
    return returnRefreshPromise;
  }

  // Warm both indexes in the background. This never blocks first paint.
  if (API_URL) {
    const cachedMaster = readCache(CACHE_KEY);
    if (!cachedMaster) refreshMasterSellers();
    const cachedReturn = readCache(RETURN_CACHE_KEY);
    if (!cachedReturn) refreshReturnSellers();
  }

  window.fetch = async function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const body = init?.body;
      if (API_URL && url === API_URL && typeof body === 'string') {
        const payload = JSON.parse(body);

        if (payload?.action === 'getSellers') {
          const cached = readCache(CACHE_KEY);
          if (cached?.sellers?.length) {
            refreshMasterSellers();
            return responseFor(cached.sellers);
          }
          const response = await nativeFetch(input, init);
          response.clone().json().then(data => {
            if (data?.ok && Array.isArray(data.data)) writeCache(CACHE_KEY, data.data);
          }).catch(() => {});
          return response;
        }

        if (payload?.action === 'getReturnSellers') {
          const cached = readCache(RETURN_CACHE_KEY);
          if (cached?.sellers) {
            refreshReturnSellers();
            return responseFor(cached.sellers);
          }
          const data = await refreshReturnSellers();
          if (Array.isArray(data)) return responseFor(data);
          return nativeFetch(`${API_URL}?action=getReturnSellers`, { method: 'GET', cache: 'no-store' });
        }

        if (payload?.action === 'addSeller') {
          const response = await nativeFetch(input, init);
          response.clone().json().then(data => {
            if (data?.ok && data.data?.name) {
              const cached = readCache(CACHE_KEY);
              const sellers = cached?.sellers || [];
              const exists = sellers.some(s => String(s.name).toLowerCase() === String(data.data.name).toLowerCase());
              if (!exists) writeCache(CACHE_KEY, [...sellers, data.data]);
            }
          }).catch(() => {});
          return response;
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };
})();
