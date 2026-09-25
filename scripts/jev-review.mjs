#!/usr/bin/env node
// A bounded saved-evidence review, not a sim or automatic promotion loop.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { askJev, askLocal } from './lib/jev.mjs';
import { evidence, sameCohort } from './lib/jev-evidence.mjs';
import { CHECK_VERSION, checkQuestions, thresholds, defaultProposal, routeChecks } from './lib/jev-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  run: { type: 'string' }, variant: { type: 'string' }, race: { type: 'string' },
  offline: { type: 'boolean', default: false }, 'jev-only': { type: 'boolean', default: false },
  local: { type: 'boolean', default: false }, proposal: { type: 'string' },
  'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('node scripts/jev-review.mjs [--run ID --variant NAME --race RACE] [--proposal FILE.json | --local] [--offline] [--dry-run]\nDefault: code-authored inspection + five atomic Jev checks. --local drafts before checking; --offline skips Jev. One request per selected provider.');
  process.exit(0);
}
if (values.offline && values['jev-only']) throw new Error('Choose --offline or --jev-only, not both.');
if (values.local && (values.proposal || values['jev-only'])) throw new Error('--local cannot be combined with --proposal or --jev-only.');
let plan = null;
if (values.proposal) {
  const file = path.resolve(values.proposal);
  if (fs.statSync(file).size > 16000) throw new Error('Proposal must be at most 16 KB.');
  plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!plan || typeof plan.text !== 'string' || !plan.text.trim()
      || (plan.cohort != null && (typeof plan.cohort !== 'object' || Array.isArray(plan.cohort)))
      || (plan.requirements != null && (!Array.isArray(plan.requirements) || plan.requirements.some(r => !r || typeof r.label !== 'string'))))
    throw new Error('Proposal requires text; optional cohort object and requirements array.');
  if (/apikey_|Bearer\s+\S+|PRIVATE KEY/.test(JSON.stringify(plan))) throw new Error('Remove credentials from proposal input.');
  plan = { text: plan.text, cohort: plan.cohort, requirements: plan.requirements };
}
const source = path.join(root, 'public/live/fidelity-summary.jsonl');
const raw = fs.readFileSync(source, 'utf8');
const rows = raw.trim().split('\n').filter(Boolean).map(JSON.parse);
const selected = rows.filter(r => (!values.run || r.run_id === values.run)
  && (!values.variant || r.variant === values.variant) && (!values.race || r.race === values.race));
if (!selected.length) throw new Error('No matching saved run.');
if ((values.run || values.variant || values.race) && selected.length !== 1)
  throw new Error('Selection is ambiguous; provide --run, --variant and --race for one summary row.');
const row = selected.at(-1);
const current = evidence(row);
const matched = rows.filter(r => r !== row && sameCohort(row, r)
  && Number.isFinite(Date.parse(r.ts)) && Date.parse(r.ts) <= Date.parse(row.ts));
const state = { current, priorMatchedRows: matched.length,
  interpretation: 'Single saved summary triage. No historical-best or promotion verdict. Requirement gaps may be for an intermediate circle. Missing observations are unknown. Raw logs and script code have not been supplied.' };
if (values['dry-run']) { console.log(JSON.stringify(state, null, 2)); process.exit(0); }
const id = `jev-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const directory = path.join(root, 'public/live/jev');
fs.mkdirSync(directory, { recursive: true });
const report = { schema: 'dragonrealms.jev-review/2', id, createdAt: new Date().toISOString(),
  kind: 'atomic-proposal-review', status: 'running', source: '/live/fidelity-summary.jsonl',
  sourceSha256: createHash('sha256').update(raw).digest('hex'), state,
  mode: values.offline ? 'offline-unverified' : values.local ? 'local-then-jev' : 'jev-only',
  checkVersion: CHECK_VERSION, thresholds, questions: checkQuestions,
  proposal: plan ?? { text: defaultProposal(current) }, proposalSource: plan ? 'supplied' : 'code',
  promotion: 'not_evaluated', jev: null, local: null, errors: [] };
// Unique per-review output avoids overwriting another worker's receipt.
const reportPath = path.join(directory, `${id}.json`);
const save = () => {
  const temp = `${reportPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(temp, reportPath);
};
save();
if (values.local || (values.offline && !plan)) {
  try { report.local = await askLocal(state, {
    baseUrl: process.env.DR_LOCAL_BASE_URL || 'http://127.0.0.1:1234/v1',
    model: process.env.DR_LOCAL_MODEL || 'dr-sims-local',
  });
    report.proposal = { text: report.local.text };
    report.proposalSource = 'local';
  } catch (error) { report.errors.push({ provider: 'local', message: error.message }); }
  save();
}
if (!values.offline && !report.errors.length) {
  try {
    report.jev = await askJev({ evidence: current, proposal: report.proposal.text }, checkQuestions);
  } catch (error) { report.errors.push({ provider: 'jev', message: error.message }); }
}
report.checks = routeChecks(current, report.jev?.answers, report.proposal);
if (report.local?.finishReason === 'length')
  report.checks = { verdict: 'abstain', reasons: ['truncated_draft'], executable: false };
report.route = report.checks.verdict;
report.status = report.errors.length ? (report.jev || report.local ? 'partial' : 'failed') : 'complete';
report.finishedAt = new Date().toISOString();
save();
const latestTemp = path.join(directory, `${id}.latest.tmp`);
fs.writeFileSync(latestTemp, JSON.stringify({ id, report: `/live/jev/${id}.json` }) + '\n');
fs.renameSync(latestTemp, path.join(directory, 'latest.json'));
console.log(JSON.stringify({ id, status: report.status, mode: report.mode,
  report: reportPath, dashboard: `http://localhost:${process.env.DR_PORT || 3000}/jev.html?run=${id}`,
  jevMs: report.jev?.elapsedMs, localMs: report.local?.elapsedMs, errors: report.errors }, null, 2));
if (report.status !== 'complete') process.exitCode = 1;
