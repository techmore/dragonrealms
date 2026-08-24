// Sim-log tailer: lists public/live logs and streams the selected one.
import { $, esc, trim, S, gm, toast } from './core.js';

/* ================= jobs ================= */

export async function listJobs() {
  try {
    const r = await fetch('/live/index.json', { cache: 'no-store' });
    S.jobs = await r.json();
  } catch { S.jobs = []; }
  if (S.job && !S.jobs.includes(S.job)) { S.job = null; S.jobLen = -1; $('joblog').textContent = '(log gone)'; }
  if (!S.job && S.jobs.length) { S.job = S.jobs[0]; S.jobLen = -1; }
  $('joblist').innerHTML = S.jobs.map((j) =>
    `<button class="${j === S.job ? 'active' : ''}" data-j="${esc(j)}">${esc(j.replace(/^fidelity-/, ''))}</button>`).join('')
    || '<span class="note">no logs yet — run a sim or verify script</span>';
  $('joblist').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    S.job = b.dataset.j;
    S.jobLen = -1;
    listJobs();
    pollJob();
  }));
}

export async function pollJob() {
  if (S.paused) return;
  const stateEl = $('jobstate');
  if (!S.job) return;
  try {
    const r = await fetch('/live/' + encodeURIComponent(S.job) + '.log', { cache: 'no-store' });
    const text = await r.text();
    if (text.length !== S.jobLen) {
      const logEl = $('joblog');
      const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
      logEl.textContent = text || '(empty)';
      if (atBottom) logEl.scrollTop = logEl.scrollHeight;
      S.jobLen = text.length;
    }
    const head = await fetch('/live/' + encodeURIComponent(S.job) + '.log', { method: 'HEAD', cache: 'no-store' });
    const age = Date.now() - Number(head.headers.get('last-modified') || 0);
    if (age < 15000) {
      stateEl.className = 'live';
      stateEl.textContent = '\u25CF live — appending';
    } else {
      stateEl.className = 'idle';
      stateEl.textContent = `\u25CB idle (last write ${Math.round(age / 1000)}s ago)`;
    }
  } catch {
    stateEl.className = 'idle';
    stateEl.textContent = '\u25CB no log yet';
  }
}
