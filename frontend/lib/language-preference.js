// This device preference contains only a supported locale, never account or case data.
export const LANGUAGE_PREFERENCE_KEY = 'nestlet.interface-language.v1';
const supported = value => value === 'zh' || value === 'en';

export function readLanguagePreference(storage = () => globalThis.localStorage) {
  try {
    const value = storage()?.getItem(LANGUAGE_PREFERENCE_KEY);
    return supported(value) ? value : 'zh';
  } catch {
    return 'zh';
  }
}

export function saveLanguagePreference(value, storage = () => globalThis.localStorage) {
  if (!supported(value)) return false;
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(LANGUAGE_PREFERENCE_KEY, value);
    return true;
  } catch {
    // A denied or full browser store must not prevent changing the current UI.
    return false;
  }
}
