import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { nativeWatchFrames } from '../public/js/puffer-native-frames.js';

test('native watch adapts observed text to the real client handlers, no privileged messages', () => {
  const result = nativeWatchFrames({run_id:'puffer-play-test',target_circle:20,
    requirements:{rows:[{label:'expertise',have:5,need:6}]},
    watch:{step:1,commands:12,captured_at:10,circle:3,last_command:'look',messages:[
      '\n[[A Room, Crossing]]\nA room.\nObvious exits: east, west.',
      'A rat attacks.', '\nHP: 90/100  Fire: 50/100  Stamina: 60/100 Circle 3  100 silvers\n> ',
      {t:'autorun',name:'bad'}, '<script>plain text</script>']}});
  assert.deepEqual(result.frames.map(f=>f.t), ['room','msg','prompt','msg','notice']);
  assert.deepEqual(result.frames[0].exits, ['east','west']);
  assert.equal(result.frames[2].requirements.circle, 4);
  assert.match(result.frames.at(-1).msg, /Last observed command/);
  assert.throws(()=>nativeWatchFrames({run_id:'../../secret',watch:{}}));
  assert.throws(()=>nativeWatchFrames({run_id:'puffer-no-screen'}));
});

test('native watch never connects or sends; ordinary client transport still works', () => {
  const source = fs.readFileSync(new URL('../public/js/net.js', import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  for (const search of ['?pufferWatch=latest','?pufferWatch=invalid','']) {
    let opened = 0, sent = 0;
    class Socket {
      static OPEN = 1; static CONNECTING = 0;
      readyState = 1;
      constructor() { opened++; }
      send() { sent++; }
    }
    const ctx = vm.createContext({URLSearchParams,location:{search,protocol:'http:',host:'localhost:3000'},
      localStorage:{getItem:()=>null},WebSocket:Socket,$:()=>null,clearTimeout(){},setTimeout(){}});
    vm.runInContext(source, ctx);
    vm.runInContext('connect(); send({t:"input",line:"look"});',ctx);
    assert.equal(opened, search ? 0 : 1);
    assert.equal(sent, search ? 0 : 1);
  }
});

test('requirements survive samples without prompt text', () => {
  const rows = [{label:'expertise',have:3,need:4}];
  const view = nativeWatchFrames({run_id:'puffer-play-test',target_circle:20,requirements:{rows},watch:{circle:1,messages:['You rest.']}});
  assert.deepEqual(view.requirements, {circle:2,rows});
  assert.equal(view.frames.some(f=>f.t==='prompt'), false);
});

test('requirement pips reveal the EXP window without a mindstate message', () => {
  const source = fs.readFileSync(new URL('../public/js/status.js',import.meta.url),'utf8');
  const render = source.slice(source.indexOf('export function renderExpBlips'),source.indexOf('export function renderFe(')).replace('export ', '');
  const blips = {};
  const revealed = [];
  const settings = {expblips:true};
  const context = vm.createContext({$:()=>blips,settings,revealWindow:id=>revealed.push(id)});
  vm.runInContext(render,context);
  context.reqs = {circle:2,rows:Array.from({length:19},(_,i)=>({label:`skill ${i}`,have:1,need:2}))};
  vm.runInContext('renderExpBlips(reqs)',context);
  assert.equal(blips.hidden,false);
  assert.equal((blips.innerHTML.match(/class="fe-blip /g)||[]).length,19);
  assert.deepEqual(revealed,['fe-tracker']);
  settings.expblips = false; revealed.length = 0;
  vm.runInContext('renderExpBlips(reqs)',context);
  assert.equal(blips.hidden,true);
  assert.deepEqual(revealed,[]);
});
