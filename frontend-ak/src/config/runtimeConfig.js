const LOCAL_API_FALLBACK = 'http://localhost:8000/api/v1';

let resolvedConfigPromise;

const toAbsoluteUrl = (value, origin) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }
  if (raw.startsWith('/')) {
    if (!origin) return null;
    return `${origin.replace(/\/$/, '')}${raw}`;
  }
  return null;
};

const normalizeApiBase = (value) => value.replace(/\/+$/, '');

const deriveWsFromApi = (apiBaseUrl) => {
  try {
    const u = new URL(apiBaseUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/ws`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
};

export const resolveRuntimeConfig = async () => {
  if (resolvedConfigPromise) return resolvedConfigPromise;

  resolvedConfigPromise = (async () => {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const origin = loc?.origin || '';

    let runtimeConfig = null;
    try {
      const response = await fetch(`/config.json?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) runtimeConfig = await response.json();
    } catch {
      runtimeConfig = null;
    }

    const runtimeApi = toAbsoluteUrl(runtimeConfig?.backendUrl, origin);
    const envApi = toAbsoluteUrl(process.env.REACT_APP_BACKEND_URL, origin);
    const apiBaseUrl = normalizeApiBase(runtimeApi || envApi || LOCAL_API_FALLBACK);

    const envWs = toAbsoluteUrl(process.env.REACT_APP_WS_URL, origin);
    const runtimeWs = toAbsoluteUrl(runtimeConfig?.wsUrl, origin);
    const websocketUrl = runtimeWs || envWs || deriveWsFromApi(apiBaseUrl);

    return { apiBaseUrl, websocketUrl };
  })();

  return resolvedConfigPromise;
};
