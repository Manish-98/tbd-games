export function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadVersionedJson(key, fallback, version = 1) {
  const value = loadJson(key, null);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Number(value.version) !== version) {
    return fallback;
  }
  return value.data;
}

export function saveVersionedJson(key, data, version = 1) {
  return saveJson(key, { version, data });
}
