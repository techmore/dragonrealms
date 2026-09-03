#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const model = process.argv[2] || process.env.SEP_MODEL;
const server = process.env.SEP_LLAMA_SERVER || '/opt/homebrew/bin/llama-server';
const errors = [];
if (model?.startsWith('ollama:')) {
  const id = model.slice('ollama:'.length);
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    const data = await res.json();
    if (!data.models?.some(m => m.name === id)) errors.push(`Ollama model not installed: ${id}`);
    else { console.log(JSON.stringify({ ready: true, provider: 'ollama', model: id, endpoint: 'http://127.0.0.1:11434' })); process.exit(0); }
  } catch { errors.push('Ollama endpoint is not reachable at http://127.0.0.1:11434'); }
}
if (!model) errors.push('model path missing; pass a GGUF path or set SEP_MODEL');
else if (!fs.existsSync(model)) errors.push(`model file not found: ${model}`);
if (!fs.existsSync(server)) errors.push(`llama-server not found: ${server}`);
else { try { execFileSync(server, ['--version'], { stdio: 'ignore' }); } catch { errors.push(`llama-server is not executable: ${server}`); } }
if (errors.length) { console.error('SEP MODEL NOT READY'); errors.forEach(e => console.error(`- ${e}`)); process.exit(1); }
console.log(JSON.stringify({ ready: true, model, bytes: fs.statSync(model).size, server }));
