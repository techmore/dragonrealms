// Requirement-table helpers for the Sims page's expanded live cards:
// an Olwydd-style at-a-glance have/need row per circle requirement.
// Values come from the driver's [reqs] log line (rank source: the merged
// exp-sheet ranks the sweep agent already polls) and the need side is the
// same circleRequirements() table the server gates on (data/guilds.js).
// Plain script (no build step) — exposed on window for the page and on
// globalThis so node tests can load the file directly.
(function (g) {
  'use strict';

  // Color thresholds (operator brief): green = met, amber = within 2 ranks,
  // red = farther out than that.
  function reqState(have, need) {
    if (have >= need) return 'met';
    return need - have <= 2 ? 'near' : 'far';
  }
  const STATE_COLOR = { met: 'var(--green, #7ee787)', near: 'var(--amber, #d29922)', far: 'var(--red, #f85149)' };

  // Olwydd column labels for the table-order ids the driver emits. Unknown
  // labels fall back to the raw id with word-capitalization.
  const PRETTY = {
    expertise: 'Expert(Tactics)',
    melee_mastery: 'Primary Mastery',
    inner_fire: 'Inner Fire',
    parry: 'Parry',
    evasion: 'Evasion',
    tactics: 'Tactics',
  };
  function prettyLabel(id) {
    if (PRETTY[id]) return PRETTY[id];
    return String(id)
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Parse a "[reqs] 5m c2 | expertise 12/4, 1st weapon 15/4, ..." line into
  // [{ label, have, need }]. Returns null for absent/malformed lines so the
  // caller can fall back gracefully (logs predating the field).
  const REQS_RE = /^\[reqs\]\s+(\d+)m\s+c(\d+)(?:\s+ts:(\S+))?\s+\|\s+(.+)$/;
  function parseReqLine(line) {
    const m = REQS_RE.exec(String(line || '').trim());
    if (!m) return null;
    const rows = [];
    for (const cell of m[4].split(', ')) {
      const cm = /^(.+?)\s+(\d+)\/(\d+)$/.exec(cell.trim());
      if (cm) rows.push({ label: cm[1].trim(), have: Number(cm[2]), need: Number(cm[3]) });
    }
    return rows.length ? { min: Number(m[1]), circle: Number(m[2]), timestamp: m[3] || null, rows } : null;
  }

  // Build the compact one-row table HTML: header cells = requirement labels,
  // value cells = "have/need" colored by reqState. Small font, fits inside
  // an expanded live card.
  function renderTable(reqs) {
    if (!reqs || !reqs.rows || !reqs.rows.length) return '';
    const head = reqs.rows.map((r) => `<th title="${r.label} — need rank ${r.need} for circle ${reqs.circle}">${prettyLabel(r.label)}</th>`).join('');
    const vals = reqs.rows.map((r) => {
      const st = reqState(r.have, r.need);
      return `<td style="color:${STATE_COLOR[st]}" title="${r.label}: ${r.have}/${r.need} for circle ${reqs.circle} — ${st}">${r.have}/${r.need}</td>`;
    }).join('');
    return `<table class="reqtable"><thead><tr>${head}</tr></thead><tbody><tr>${vals}</tr></tbody></table>`;
  }

  g.DRReqTable = { reqState, STATE_COLOR, prettyLabel, parseReqLine, renderTable };
})(typeof window !== 'undefined' ? window : globalThis);
