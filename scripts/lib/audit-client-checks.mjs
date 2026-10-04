// Focused real-browser acceptance for the October audit. No production writes,
// no simulation launches, and no deletion/reload of user-owned characters.
export async function runAuditClientChecks({ cdp, url, gmToken, log = console.log }) {
  let count = 0;
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async expression => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      try { if (await evaluate(expression)) return; } catch {} // navigation may replace the execution context
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('Audit wait timed out: ' + expression);
  };
  const check = (label, result) => { if (!result) throw new Error('Audit check failed: ' + label); count++; log('PASS - ' + label); };
  const navigate = async path => {
    await cdp('Page.navigate', { url: url + path });
    await wait(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(new URL(path, url).pathname)}`);
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const user = 'audit' + Date.now();
  await evaluate(`document.getElementById('wf-user').value=${JSON.stringify(user)};document.getElementById('wf-pass').value='audit-password';document.getElementById('wf-register').click()`);
  await wait(`!document.getElementById('chargen').hidden`);
  await evaluate(`document.getElementById('cg-name').value='Audit'+Array.from({length:6},()=>String.fromCharCode(97+Math.floor(Math.random()*26))).join('');document.getElementById('cg-submit').click()`);
  await wait(`!document.getElementById('cg-alloc-row').hidden`);
  await evaluate(`document.getElementById('cg-enter').click()`);
  await wait(`!document.getElementById('journey-toggle').hidden`);
  check('persistent guildless next-step guidance', await evaluate(`document.getElementById('journey-text').textContent.includes('Explore the guilds')`));
  check('programmatic commands preserve exact draft and selection', await evaluate(`(async()=>{
    const i=document.getElementById('cmd');i.focus();i.value='say unfinished';i.setSelectionRange(4,8);
    (await import('/js/input.js')).pressEnter('look');return i.value==='say unfinished'&&i.selectionStart===4&&i.selectionEnd===8&&document.activeElement===i;
  })()`));
  check('native browser zoom is not intercepted', await evaluate(`(()=>{const e=new KeyboardEvent('keydown',{key:'=',ctrlKey:true,bubbles:true,cancelable:true});document.getElementById('cmd').dispatchEvent(e);return !e.defaultPrevented;})()`));
  check('Windows menu keeps keyboard focus after toggle', await evaluate(`(()=>{document.getElementById('windows-btn').click();const c=document.querySelector('.wmenu-vis');c.focus();c.checked=!c.checked;c.dispatchEvent(new Event('change'));return document.activeElement.classList.contains('wmenu-vis');})()`));
  check('Windows Escape returns focus to its opener', await evaluate(`(()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return document.getElementById('windows-menu').hidden&&document.activeElement.id==='windows-btn';})()`));
  await evaluate(`(async()=>{const a=await import('/js/automation.js');a.handleAutomation('trigger __audit_unmatched_one__ look');})()`);
  await cdp('Page.reload', {});
  await wait(`!!document.querySelector('.wslot:not(.wnew)')`);
  check('trigger reload/add/remove preserves distinct records', await evaluate(`(async()=>{const a=await import('/js/automation.js');a.handleAutomation('trigger __audit_unmatched_two__ look');const own=a.triggers.filter(t=>t.pattern.startsWith('__audit_unmatched'));const unique=new Set(own.map(t=>t.id)).size===2;a.handleAutomation('trigger remove '+own[0].id);const remaining=a.triggers.some(t=>t.id===own[1].id);a.handleAutomation('trigger remove '+own[1].id);return unique&&remaining;})()`));
  await evaluate(`document.querySelector('.wslot:not(.wnew)').click()`);
  await wait(`!document.getElementById('journey-toggle').hidden`);
  await evaluate(`document.getElementById('journey-dismiss').click()`);
  await cdp('Page.reload', {});
  await wait(`!!document.querySelector('.wslot:not(.wnew)')`);
  await evaluate(`document.querySelector('.wslot:not(.wnew)').click()`);
  await wait(`!document.getElementById('journey-toggle').hidden`);
  check('guide dismissal persists and can be reopened', await evaluate(`(()=>{const hidden=document.getElementById('journey-guide').hidden;document.getElementById('journey-toggle').click();return hidden&&!document.getElementById('journey-guide').hidden;})()`));
  check('pause-all stops scripts and suppresses triggers without deleting them', await evaluate(`(async()=>{
    const s=await import('/js/scripts.js'),a=await import('/js/automation.js'),p=await import('/js/automation-control.js');
    p.setAutomationPaused(false);const saved=await s.saveScript('auditpause',${JSON.stringify('pause 60\nput look\nexit')});if(!saved.ok)return false;s.runScript('auditpause');
    const running=s.isScriptRunning();a.handleAutomation('trigger __audit_pause__ look');p.setAutomationPaused(true);
    const before=document.getElementById('terminal').textContent;a.runTriggers('__audit_pause__');const ok=running&&!s.isScriptRunning()&&document.getElementById('terminal').textContent===before&&a.triggers.some(t=>t.pattern==='__audit_pause__');
    a.handleAutomation('trigger remove '+a.triggers.find(t=>t.pattern==='__audit_pause__').id);return ok;
  })()`));
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  // Chromium's offline emulation leaves an existing WebSocket open. Close
  // the fixture's tracked socket to exercise an actual disconnected send.
  await evaluate(`window.__auditSockets.filter(s=>s.readyState===WebSocket.OPEN).forEach(s=>s.close())`);
  await wait(`document.getElementById('conn-status').textContent.includes('disconnected')`);
  check('failed offline typed send retains exact draft', await evaluate(`(()=>{const i=document.getElementById('cmd');i.value='  look  ';i.setSelectionRange(2,4);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));return i.value==='  look  '&&i.selectionStart===2&&i.selectionEnd===4;})()`));
  check('offline character selection provides retry feedback', await evaluate(`(async()=>{const w=await import('/js/welcome.js');w.showWelcome('charselect','1) Audit character');document.querySelector('.wslot').click();return document.getElementById('wf-err').textContent.includes('not sent')&&!document.querySelector('.wslot').disabled;})()`));
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await navigate('/admin.html#gm=' + gmToken);
  await wait(`document.getElementById('gm-status').textContent.includes('GM ok')`);
  check('GM mutation transport keeps method and authorization headers', await evaluate(`(async()=>{const c=await import('/js/admin/core.js'),old=window.fetch;let call;window.fetch=async(u,o)=>{call=o;return {status:200,ok:true,json:async()=>({ok:true})};};try{await c.gm('admin/reload',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return call.method==='POST'&&call.headers.get('Authorization')?.startsWith('Bearer ')&&call.headers.get('Content-Type')==='application/json';}finally{window.fetch=old;}})()`));
  await navigate('/characters.html');
  await wait(`document.querySelectorAll('#rows input[type=checkbox]').length>0`);
  check('character deletion UI does not claim unknown provenance is safe', await evaluate(`document.body.textContent.includes('provenance unknown')&&!document.body.textContent.includes('safe to delete')`));
  await navigate('/gm.html');
  await wait(`document.querySelectorAll('.gm-room').length>0`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check('GM mobile layout exposes both columns without clipping', await evaluate(`(()=>{const s=document.querySelector('#gm-app section').getBoundingClientRect();return s.right<=innerWidth+1&&s.left>=0&&getComputedStyle(document.body).overflowY!=='hidden';})()`));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const fault = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const originalFetch=window.fetch;window.fetch=(url,opts)=>['/live/index.json','/live/index-meta.json'].some(path=>String(url).endsWith(path))?Promise.reject(new Error('audit discovery fault')):originalFetch(url,opts);})();` });
  await navigate('/sims.html');
  await wait(`document.getElementById('discovery-state').textContent.includes('unavailable')`);
  check('discovery failure remains unavailable, not zero live', await evaluate(`document.getElementById('discovery-state').textContent.includes('unavailable')&&!document.getElementById('discovery-state').textContent.includes('0 live')`));
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: fault.identifier });
  await cdp('Page.reload', {});
  await wait(`document.getElementById('discovery-state').textContent.includes('last success:')&&!document.getElementById('discovery-state').textContent.includes('never')`);
  check('Sims discovery recovers after network failure', true);
  log(`ALL ${count} AUDIT CLIENT CHECKS PASSED`);
  return count;
}
