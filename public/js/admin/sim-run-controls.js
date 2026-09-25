import { storedGmToken } from '../gm-token.js';

const $ = id => document.getElementById(id);
const minutes = $('benchmark-minutes'), start = $('benchmark-start'), stop = $('benchmark-stop');
let state = {status:'idle'}, pending = false, available = false;
const active = () => ['starting','running','stopping'].includes(state.status);
function preview() {
  const n = Number(minutes.value);
  const valid = Number.isInteger(n) && n>=1 && n<=120;
  $('benchmark-preview').textContent = valid
    ? `Three characters run concurrently for up to ${n} minutes each. ${n===30?'Standard benchmark duration.':'Custom duration — compare with other runs of the same length.'}`
    : 'Enter a whole number from 1 to 120 minutes.';
  start.disabled = pending || active() || state.status==='external' || !valid || !available;
  stop.disabled = !available || pending || !active() || state.status==='stopping';
  minutes.disabled = active() || pending;
  document.querySelectorAll('[data-run-minutes]').forEach(b=>{b.disabled=active()||pending;});
}
function render() {
  const labels = {external:'Another comparison is running outside these controls. Wait for its saved results before starting a new one.', idle:'Ready to start.', starting:'Starting comparison…', running:'Comparison running', stopping:'Stopping and saving results…', stopped:'Comparison stopped. Saved results remain available.', finished:'Comparison finished. Review the experiment cards for target completion.', failed:'Comparison failed. Check the run log.'};
  $('benchmark-status').textContent = (labels[state.status] || state.status)
    + (state.runId ? ` · Run ${state.runId}` : '')
    + (active() && state.endsAt ? ` · Estimated end ${new Date(state.endsAt).toLocaleTimeString()}` : '');
  const link=$('benchmark-log');link.hidden=!state.log;
  if(state.log) link.href=state.log;
  preview();
}
async function request(body) {
  const token=storedGmToken();
  if(!token) throw Error('Open Sims from the Admin dashboard to enable authenticated run controls.');
  const response=await fetch('/api/gm/sim-runs', {method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(!response.ok) throw Error(response.status===404?'Restart the game server to enable the new run controls.':result.error||'Run controls are unavailable.');
  return result;
}
async function refresh() {
  if(pending)return;
  try {state=await request();available=true;$('benchmark-error').textContent='';render();}
  catch(error){available=false;$('benchmark-error').textContent=error.message;$('benchmark-status').textContent='Run status unavailable.';preview();}
}
async function act(action) {
  if(pending)return;
  pending=true;preview();$('benchmark-error').textContent='';
  try {state=await request({action,minutes:Number(minutes.value)});available=true;render();}
  catch(error){$('benchmark-error').textContent=error.message;}
  finally {pending=false;preview();}
}
minutes.addEventListener('input',preview);
document.querySelectorAll('[data-run-minutes]').forEach(b=>b.addEventListener('click',()=>{minutes.value=b.dataset.runMinutes;preview();}));
start.addEventListener('click',()=>act('start'));
stop.addEventListener('click',()=>act('stop'));
preview();refresh();
const timer=setInterval(()=>{if(!document.hidden)refresh();},10000);
window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
