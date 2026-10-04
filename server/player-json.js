// Legacy JSON columns have no schema tag. Validate their runtime shape at
// load, retaining valid entries and reporting repairs without logging content.
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function decodePlayerJson(raw, { path, shape, entry, fallback }, diagnostics = []) {
  if (raw === null || raw === undefined || raw === '') return structuredClone(fallback);
  let value;
  try { value = JSON.parse(raw); }
  catch { diagnostics.push({ path, code: 'malformed-json' }); return structuredClone(fallback); }
  if (!shape(value)) {
    diagnostics.push({ path, code: 'invalid-shape' });
    return structuredClone(fallback);
  }
  if (!entry) return value;
  if (Array.isArray(value)) return value.filter((item, index) => {
    if (entry(item, index)) return true;
    diagnostics.push({ path: `${path}.${index}`, code: 'invalid-entry' });
    return false;
  });
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => {
    if (entry(item, key)) return true;
    diagnostics.push({ path: `${path}.${key}`, code: 'invalid-entry' });
    return false;
  }));
}

export const stringList = (path) => ({ path, shape: Array.isArray, entry: (v) => typeof v === 'string' && v.length > 0, fallback: [] });
export const optionalRecord = (path, validate = () => true) => ({ path, shape: (v) => isRecord(v) && validate(v), fallback: null });
