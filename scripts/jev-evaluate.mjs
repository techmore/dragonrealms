#!/usr/bin/env node
// Fixed, bounded API evaluation. No game sessions or sim mutation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { askJev } from './lib/jev.mjs';
import { CHECK_VERSION, checkQuestions, thresholds, riskKeys, routeChecks } from './lib/jev-checks.mjs';
import { cases } from '../test/fixtures/jev-cases.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public/live/jev');
fs.mkdirSync(dir, { recursive: true });
const id = `jev-eval-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`;
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report = { id, kind: 'semantic-check-evaluation', status: 'running', createdAt: new Date().toISOString(),
  checkVersion: CHECK_VERSION, thresholds, questions: checkQuestions, questionsSha256: hash(checkQuestions),
  fixturesSha256: hash(cases), fixtures: cases, maxRequests: cases.length, results: [],
  limitation: 'Small authored challenge set; validation labels were fixed before querying. Not production calibration, independent labeling, or a gameplay benchmark.' };
const file = path.join(dir, `${id}.json`);
const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(report, null, 2)); fs.renameSync(`${file}.tmp`, file); };
save();
// Four bounded requests at a time; independent questions share each request.
for (let i = 0; i < cases.length; i += 4) {
  const batch = await Promise.all(cases.slice(i, i + 4).map(async example => {
    try {
      const result = await askJev({ evidence: example.evidence, proposal: example.proposal.text }, checkQuestions);
      const decision = routeChecks(example.evidence, result.answers, example.proposal);
      const actual = Object.fromEntries(riskKeys.map(key => [key, result.answers[key].noul >= 0.5]));
      actual.proposal_kind = result.answers.proposal_kind.choice;
      actual.testability = Math.round(result.answers.testability.score);
      actual.verdict = decision.verdict;
      const mismatches = Object.entries(example.expected).filter(([key, value]) => actual[key] !== value).map(([key]) => key);
      const brier = riskKeys.reduce((sum, key) => sum + (result.answers[key].noul - Number(example.expected[key])) ** 2, 0) / riskKeys.length;
      return { id: example.id, split: example.split, result, decision, actual, expected: example.expected, mismatches, brier };
    } catch (error) { return { id: example.id, split: example.split, error: error.message }; }
  }));
  report.results.push(...batch); save();
}
report.summary = Object.fromEntries(['development', 'validation'].map(split => {
  const rows = report.results.filter(r => r.split === split), ok = rows.filter(r => !r.error);
  const sorted = ok.map(r => r.result.elapsedMs).sort((a,b) => a-b);
  return [split, { cases: rows.length, errors: rows.length - ok.length,
    exactCases: ok.filter(r => !r.mismatches.length).length,
    semanticLabels: rows.length * 5,
    semanticLabelsCorrect: ok.reduce((sum, r) => sum + 5 - r.mismatches.filter(key => key !== 'verdict').length, 0),
    verdictCorrect: ok.filter(r => r.actual.verdict === r.expected.verdict).length,
    falseClear: ok.filter(r => r.actual.verdict === 'reviewable' && r.expected.verdict !== 'reviewable').length,
    abstentions: ok.filter(r => r.actual.verdict === 'abstain').length,
    meanBrier: ok.length ? ok.reduce((s,r) => s + r.brier, 0) / ok.length : null,
    medianMs: sorted.length ? sorted[Math.floor(sorted.length/2)] : null,
    inputTokens: ok.reduce((s,r) => s + (r.result.usage?.input_tokens ?? 0), 0) }];
}));
report.status = report.results.some(r => r.error) ? 'partial' : 'complete';
report.finishedAt = new Date().toISOString(); save();
const latest = path.join(dir, `${id}.latest.tmp`);
fs.writeFileSync(latest, JSON.stringify({ id, report: `/live/jev/${id}.json` }));
fs.renameSync(latest, path.join(dir, 'evaluation-latest.json'));
console.log(JSON.stringify({ id, status: report.status, summary: report.summary, file }, null, 2));
if (report.status !== 'complete') process.exitCode = 1;
