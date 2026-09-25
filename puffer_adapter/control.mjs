// Loopback-only dashboard control. No game access, shell commands, or deployment.
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const origins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
const runPattern = /^puffer-[a-zA-Z0-9-]{1,100}$/;

export function startArgs(body) {
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['updates','minutes'].includes(key))
      || ![50,100,500].includes(body.updates) || ![10,30,60].includes(body.minutes)) throw new Error('Choose 50, 100 or 500 updates and a 10, 30 or 60 minute cap.');
  return ['-m','puffer_adapter.run','--scenario','barbarian','--target-circle','20',
    '--steps',String(body.updates * 128),'--seconds',String(body.minutes * 60),
    '--evaluation-seconds','3600','--demonstration-episodes','8',
    '--demonstration-teacher','requirements','--imitation-epochs','100','--imitation-balanced','--script-comparison'];
}

export async function activeRuns() {
  const {stdout} = await exec('ps',['-axo','pid=,command='], {timeout:3000,maxBuffer:4*1024*1024});
  return stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+\S*python\S*\s+-m\s+puffer_adapter\.(train|evaluate)\s+.*?--run-id\s+(puffer-[a-zA-Z0-9-]+)(?:\s|$)/i);
    return match ? [{pid:Number(match[1]),run_id:match[3],kind:match[2]}] : [];
  });
}
async function command(args) {
  const {stdout} = await exec(path.join(root,'.puffer-venv/bin/python'),args,{cwd:root,timeout:15000,maxBuffer:1024*1024});
  return stdout;
}

export function createControl({active = activeRuns, execute = command} = {}) {
  let pending = false;
  return http.createServer(async (req,res) => {
    const origin = req.headers.origin;
    const reply = (code,data) => { res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data)); };
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '') || !origins.has(origin)) return reply(403,{error:'Local Dragon Realms dashboard origin required.'});
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','GET, POST');
      res.setHeader('Access-Control-Allow-Headers','Content-Type');
      return reply(200,{});
    }
    try {
      if (req.method === 'GET' && req.url === '/status') return reply(200,{pending,runs:await active()});
      if (req.method !== 'POST' || !['/start','/stop'].includes(req.url)) return reply(404,{error:'Unknown operation.'});
      if (req.headers['content-type'] !== 'application/json') return reply(415,{error:'JSON required.'});
      let raw = '';
      for await (const part of req) { raw += part; if (raw.length > 1024) return reply(413,{error:'Request too large.'}); }
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400,{error:'Invalid JSON.'}); }
      if (pending) return reply(409,{error:'Another control request is in progress.'});
      pending = true;
      try {
        const runs = await active();
        if (req.url === '/start') {
          let args;
          try { args = startArgs(body); } catch(error) { return reply(400,{error:error.message}); }
          if (runs.length) return reply(409,{error:'A trainer or evaluation is already running.',runs});
          const output = await execute(args);
          return reply(200,{started:JSON.parse(output)});
        }
        if (!body || Object.keys(body).length !== 1 || !runPattern.test(body.run_id)
            || !runs.some(row=>row.run_id === body.run_id && row.kind === 'train')) return reply(409,{error:'The specified trainer is not active; no stop sent.'});
        await execute(['-m','puffer_adapter.run','--stop',body.run_id]);
        return reply(200,{stopping:body.run_id});
      } finally { pending = false; }
    } catch { reply(503,{error:'Controller operation failed. Inspect the local controller or run log; no automatic retry was made.'}); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createControl();
  server.requestTimeout = 10000;
  server.listen(8788,'127.0.0.1',()=>console.log('Puffer dashboard controls: 127.0.0.1:8788'));
}
