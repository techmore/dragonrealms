// Keep file positions in bytes; decoding the assembled bytes also preserves
// UTF-8 characters split across successive appends.
export function emptyTail() {
  return { bytes: new Uint8Array(), text: '', validator: '', identity: '' };
}

export async function readTail(url, prior = emptyTail(), { fetcher = fetch, size, reset = false } = {}) {
  const offset = prior.bytes.byteLength;
  const ranged = offset > 0 && !reset && !(Number.isFinite(size) && size <= offset);
  const headers = ranged ? { Range: `bytes=${offset}-` } : {};
  if (ranged && prior.validator && !prior.identity) headers['If-Range'] = prior.validator;
  const response = await fetcher(url, { cache: 'no-store', headers, signal: AbortSignal.timeout(10000) });
  if (response.status === 416 && ranged) return readTail(url, prior, { fetcher, reset: true });
  if (response.status !== 200 && response.status !== 206) throw new Error(`Log HTTP ${response.status}`);
  const identity = response.headers.get('x-file-identity') || '';
  if (ranged && response.status === 206 && prior.identity && identity !== prior.identity) {
    return readTail(url, prior, { fetcher, reset: true });
  }
  const chunk = new Uint8Array(await response.arrayBuffer());
  let bytes = chunk;
  if (response.status === 206) {
    const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('content-range') || '');
    const start = Number(match?.[1]), end = Number(match?.[2]);
    if (!match || start !== (ranged ? offset : 0) || end < start || end - start + 1 !== chunk.byteLength
      || (match[3] !== '*' && Number(match[3]) <= end)) {
      throw new Error('Invalid log Content-Range');
    }
    bytes = new Uint8Array(start + chunk.byteLength);
    if (ranged) bytes.set(prior.bytes);
    bytes.set(chunk, start);
  }
  // stream:true holds an unfinished trailing code point until the next poll.
  const text = new TextDecoder().decode(bytes, { stream: true });
  return { bytes, text, validator: response.headers.get('etag') || response.headers.get('last-modified') || '', identity };
}

export function discoveryState(previous = { status: 'unknown', lastSuccess: null, data: null }, outcome, now = Date.now()) {
  if (outcome.ok) return { status: 'available', lastSuccess: now, data: outcome.data };
  return { ...previous, status: previous.lastSuccess !== null ? 'stale' : 'unavailable' };
}

export function discoveryLabel(state) {
  if (state.status === 'available') return `${state.data.length} live now · last success: ${new Date(state.lastSuccess).toISOString()}`;
  const last = state.lastSuccess === null ? 'never' : new Date(state.lastSuccess).toISOString();
  return `live ${state.status} · last success: ${last}${state.data ? ` · ${state.data.length} previously observed` : ''}`;
}
