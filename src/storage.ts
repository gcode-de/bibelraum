const APP_STORAGE_PREFIX = 'das-wort';
const LEGACY_STORAGE_PREFIX = 'bibelraum';

export function readAppStorage(name: string) {
  const currentKey = `${APP_STORAGE_PREFIX}.${name}`;
  const currentValue = localStorage.getItem(currentKey);
  if (currentValue !== null) return currentValue;

  const legacyValue = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}.${name}`);
  if (legacyValue !== null) localStorage.setItem(currentKey, legacyValue);
  return legacyValue;
}

export function writeAppStorage(name: string, value: string) {
  localStorage.setItem(`${APP_STORAGE_PREFIX}.${name}`, value);
}
