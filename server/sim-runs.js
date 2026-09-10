// GM-only bounded benchmark launcher. No shell or caller-supplied commands.
import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const live = root + 'public/live/';
export function validateSimRun(body) {
  if (!body || !Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 120)
    throw new Error('Choose a whole-number time limit from 1 to 120 minutes.');
  return { minutes: body.minutes, variants: ['baseline', 'edgedSkinCheapKit', 'edgedSkinActivity'],
    circle: 5, boost: 20, concurrency: 3, race: 'gortog', statPolicy: 'paired-fixed-v1' };
}
export function createSimRuns({ launch = spawn, busy = () => {
  const processes = execFileSync('ps', ['-axo', 'args='], {encoding:'utf8'});
  return processes.split('\n').some(line => /^\s*\S*node\S*\s+.*race-guild-sweep\.mjs(?:\s|$)/.test(line));
}, outputDir = live } = {}) {
  let child = null, state = { status:'idle' }, timer;
  const status = () => {
    if (!child && busy()) return {status:'external'};
    if (child) {
      try {
        const manifest = JSON.parse(readFileSync(outputDir+'experiment-current.json','utf8'));
        if (Date.parse(manifest.startedAt) >= Date.parse(state.startedAt)) {
          state.runId = manifest.runId;
          state.manifest = '/live/experiment-'+manifest.runId+'.json';
        }
      } catch {}
    }
    return {...state};
  };
  const stop = () => {
    if (!child) return status();
    state.status = 'stopping'; child.kill('SIGTERM');
    clearTimeout(timer);
    timer = setTimeout(() => child?.kill('SIGKILL'), 10000); timer.unref();
    return status();
  };
  return { status, stop, start(body, port) {
    const config = validateSimRun(body);
    if (child || busy()) throw new Error('A comparison is already running. Wait for it to finish before starting another.');
    mkdirSync(outputDir,{recursive:true});
    const startedAt = new Date().toISOString();
    const filename = `launcher-${Date.now()}.log`;
    const fd = openSync(outputDir+filename,'a');
    state = { status:'starting', startedAt, endsAt:new Date(Date.now()+config.minutes*60000).toISOString(),
      config, log:'/live/'+filename, runId:null };
    try {
      child = launch(process.execPath, ['scripts/race-guild-sweep.mjs', '--benchmark','barbarian',
        '--variants',config.variants.join(','),'--races','gortog','--stat-policy',config.statPolicy,
        '--concurrency','3','--minutes',String(config.minutes),'--circle','5','--boost','20'],
      {cwd:root, env:{...process.env, DR_PORT:String(port), PORT:String(port)}, stdio:['ignore',fd,fd]});
    } catch (error) { state.status='failed'; state.error=error.message; throw error; }
    finally {closeSync(fd);}
    child.once('spawn',()=>{state.status='running';});
    let settled = false;
    const finish = (error, code) => {
      if (settled) return;
      settled = true;
      status();
      clearTimeout(timer);
      state.status = error ? 'failed' : state.status==='stopping' ? 'stopped' : code===0 ? 'finished' : 'failed';
      if(error) state.error=error.message;
      state.finishedAt=new Date().toISOString(); child=null;
    };
    child.once('error',error=>finish(error));
    child.once('exit',code=>finish(null,code));
    timer=setTimeout(stop,config.minutes*60000+30000); timer.unref();
    return status();
  }};
}
const runs = createSimRuns();
export async function simRunRequest(req,res) {
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method==='GET') {
    try {return send(200,runs.status());}
    catch {return send(503,{error:'Unable to check existing sweep processes.'});}
  }
  if(req.method!=='POST') return send(405,{error:'Use GET or POST.'});
  try {
    let text='';
    for await (const chunk of req) {text+=chunk;if(text.length>2048) return send(413,{error:'Request too large.'});}
    const body=JSON.parse(text);
    if(body.action==='stop') return send(200,runs.stop());
    if(body.action!=='start') return send(400,{error:'Choose start or stop.'});
    return send(202,runs.start(body,req.socket.localPort));
  } catch(error) {return send(400,{error:error.message});}
}
