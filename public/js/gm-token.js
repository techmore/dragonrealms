// Shared GM credential harvest for admin console pages. The #gm=<token>
// fragment is the trusted-launcher handoff (menu-bar app, dash links): it is
// stored for this tab only and stripped from the address bar so the token
// never lingers there or survives the browser session on disk.
//
// One implementation, deliberately: four pages used to carry divergent copies
// of this regex and two of them missed %, so URL-encoded tokens silently
// failed there.

export const GM_TOKEN_KEY = 'dr_gm_token';
const GM_FRAGMENT_RE = /^#gm=([A-Za-z0-9_%-]+)$/;

export function clearLegacyGmToken() {
  try { localStorage.removeItem(GM_TOKEN_KEY); } catch {}
}

export function hasStoredGmToken() {
  clearLegacyGmToken();
  try { return Boolean(sessionStorage.getItem(GM_TOKEN_KEY)); } catch { return false; }
}

export function storedGmToken() {
  clearLegacyGmToken();
  try { return sessionStorage.getItem(GM_TOKEN_KEY) || ''; } catch { return ''; }
}

export function storeGmToken(token) {
  clearLegacyGmToken();
  try { sessionStorage.setItem(GM_TOKEN_KEY, token); } catch {}
}

// Consume #gm=<token> from the current location if present: store it and
// strip it from the URL. Returns true when a fragment was found.
export function harvestGmTokenFromFragment() {
  clearLegacyGmToken();
  try {
    const m = location.hash.match(GM_FRAGMENT_RE);
    if (!m) return false;
    storeGmToken(decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch { return false; }
}
