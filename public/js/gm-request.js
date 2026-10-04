// Shared bounded transport. Caller options cannot replace the GM credential.
export async function gmRequest(url, token, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  else headers.delete('Authorization');
  return fetch(url, { ...options, cache: 'no-store', headers,
    signal: options.signal || AbortSignal.timeout(10000) });
}
