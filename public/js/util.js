// Shared DOM / text helpers.
export const $ = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function stripAnsi(s) {
  return String(s).replace(/\x1b\[\d+m/g, '');
}
