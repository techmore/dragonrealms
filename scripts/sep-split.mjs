#!/usr/bin/env node
// Deterministically split SEP JSONL records by run id, preventing records from
// the same cohort leaking into both training and held-out evaluation.
import fs from 'node:fs';

const [input, outputDir = 'documentation/sep-data'] = process.argv.slice(2);
if (!input) { console.error('usage: sep-split.mjs corpus.jsonl [output-dir]'); process.exit(2); }
const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const runs = [...new Set(rows.map(r => r.runId))].sort();
const testRuns = new Set(runs.filter((_, i) => i % 10 === 0));
const validRuns = new Set(runs.filter((_, i) => i % 10 === 5));
const train = rows.filter(r => !testRuns.has(r.runId) && !validRuns.has(r.runId));
const valid = rows.filter(r => validRuns.has(r.runId));
const evaluate = rows.filter(r => testRuns.has(r.runId));
fs.mkdirSync(outputDir, { recursive: true });
const write = (name, data) => fs.writeFileSync(`${outputDir}/${name}.jsonl`, data.map(r => JSON.stringify(r)).join('\n') + (data.length ? '\n' : ''));
write('train', train); write('valid', valid); write('test', evaluate);
const report = { records: rows.length, runs: runs.length, trainRecords: train.length, validRecords: valid.length, testRecords: evaluate.length, validRuns: [...validRuns], testRuns: [...testRuns] };
fs.writeFileSync(`${outputDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
