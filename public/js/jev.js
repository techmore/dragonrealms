const $ = id => document.getElementById(id);
const known = value => value == null ? 'unknown' : String(value);
const words = value => String(value).replaceAll('_', ' ');
async function read(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Saved evidence unavailable (HTTP ${response.status}). Run a review from the project terminal.`);
  return response.json();
}
async function refresh() {
  $('refresh').disabled = true;
  await evaluation();
  try {
    let id = new URLSearchParams(location.search).get('run');
    if (!id) id = (await read('/live/jev/latest.json')).id;
    if (!/^jev-[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid review ID.');
    const url = `/live/jev/${id}.json`, report = await read(url), current = report.state.current;
    $('status').textContent = `${report.status} · ${report.mode} · ${report.createdAt} · saved review, not a live sim`;
    $('identity').textContent = `Run ${current.runId} · ${current.variant} · ${current.timestamp}`;
    $('cohort').textContent = Object.entries(current.cohort).map(([k,v]) => `${k}: ${known(v)}`).join(' · ');
    $('facts').replaceChildren(...[
      ['Circle', current.circle], ['Target reached', current.targetReached], ['Remaining gap', current.remainingGap],
      ['Gap closed', current.gapClosure], ['Deaths', current.deaths],
    ].map(([title, value]) => {
      const span = document.createElement('span'), strong = document.createElement('strong');
      strong.textContent = known(value); span.append(strong, title); return span;
    }));
    $('requirements').replaceChildren(...(current.missing || []).map(row => {
      const tr = document.createElement('tr');
      for (const value of [row.label, row.have, row.need]) { const td = document.createElement('td'); td.textContent = known(value); tr.append(td); }
      return tr;
    }));
    $('comparison').textContent = `${report.state.priorMatchedRows} prior rows match the recorded cohort dimensions. This is summary triage; no historical-best comparison or promotion has been performed.${current.completionFlagConflict || current.gapConflict ? ' Conflicting telemetry: inspect the receipt.' : ''}`;
    const answer = report.jev?.answers.investigation;
    $('decision').textContent = report.checks ? `${report.checks.verdict} · ${report.checks.reasons.map(words).join(', ')} · no execution authority`
      : answer ? `${words(answer.choice)} · confidence ${answer.confidence.toFixed(3)} · route: ${words(report.route)}` : 'Jev not used or unavailable.';
    $('atomic-checks').replaceChildren();
    if (report.checks && report.jev) {
      for (const [key, value] of Object.entries(report.jev.answers)) {
        const p = document.createElement('p');
        p.textContent = `${words(key)}: ${value.type === 'noul' ? `P(yes) ${value.noul.toFixed(3)}`
          : value.type === 'score' ? `${value.score.toFixed(2)} / 2 · confidence ${value.confidence.toFixed(3)}`
          : `${value.choice} · confidence ${value.confidence.toFixed(3)}`}`;
        $('atomic-checks').append(p);
      }
    }
    $('jev-timing').textContent = report.jev ? `${report.jev.model} · ${report.jev.elapsedMs} ms · ${known(report.jev.usage?.input_tokens)} input tokens` : '';
    $('proposal').textContent = report.proposal?.text || report.local?.text || 'Local companion not used or unavailable.';
    $('local-timing').textContent = report.local ? `${report.local.model} · ${report.local.elapsedMs} ms · ${known(report.local.usage?.completion_tokens)} output tokens${report.local.finishReason === 'length' ? ' · output truncated' : ''}` : '';
    $('local-review').textContent = report.checks ? `Source: ${report.proposalSource}. Jev verdict: ${report.checks.verdict}. Exact numeric claims are checked in code when supplied as structured fields; free-text arithmetic has not been verified.` : report.localReview
      ? `Quality review: ${report.localReview.verdict}. ${report.localReview.reason}`
      : 'Quality review: pending. Successful generation does not establish correctness.';
    if (report.errors.length) $('status').textContent += ` · ${report.errors.map(e => `${e.provider}: ${e.message}`).join('; ')}`;
    $('receipt').href = url; $('receipt').hidden = false;
  } catch (error) { $('status').textContent = error.message; }
  finally { $('refresh').disabled = false; }
}
async function evaluation() {
  try {
    const latest = await read('/live/jev/evaluation-latest.json');
    if (!/^jev-eval-[a-zA-Z0-9-]{1,100}$/.test(latest.id)) throw new Error('Invalid evaluation ID');
    const url = `/live/jev/${latest.id}.json`, data = await read(url);
    $('evaluation-status').textContent = `${data.status} · ${data.checkVersion} · ${data.createdAt}`;
    $('evaluation-results').replaceChildren(...Object.entries(data.summary ?? {}).map(([split, s]) => {
      const p = document.createElement('p');
      const rows = data.results.filter(r => r.split === split && !r.error);
      const semantic = rows.reduce((sum, r) => sum + 5 - r.mismatches.filter(key => key !== 'verdict').length, 0);
      p.textContent = `${split}: ${semantic}/${s.cases * 5} semantic labels correct · ${s.verdictCorrect}/${s.cases} expected routes · ${s.falseClear} false clears · ${s.abstentions} abstentions · ${s.errors} API errors · median ${s.medianMs ?? '?'} ms`;
      return p;
    }));
    $('evaluation-cases').replaceChildren(...data.results.map(row => {
      const p = document.createElement('p');
      p.textContent = `${row.split} / ${row.id}: ${row.error || `${row.actual.verdict} (expected ${row.expected.verdict}) · ${row.mismatches.length ? `differences: ${row.mismatches.join(', ')}` : 'all labels match'}`}`;
      return p;
    }));
    $('evaluation-receipt').href = url; $('evaluation-receipt').hidden = false;
  } catch (error) { $('evaluation-status').textContent = error.message; }
}
$('refresh').addEventListener('click', refresh);
refresh();
