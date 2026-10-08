// Test-only native hall journey. Select temporary DB before game imports.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { virtualClock } from '../../puffer_adapter/virtual_clock.mjs';
import { productionLibrary } from '../../puffer_adapter/script_baseline.mjs';
import { scriptController } from '../../puffer_adapter/script_controller.mjs';
const directory = mkdtempSync(join(tmpdir(), 'dr-puffer-native-hall-'));
process.env.DR_DB_PATH = join(directory, 'world.db');
console.log = (...args) => process.stderr.write(args.join(' ')+'\n');
const { migrate, closeDb } = await import('../../server/db.js');
const { registerAccount } = await import('../../server/auth.js');
const { createCharacter, loadPlayer } = await import('../../server/player.js');
const { Game } = await import('../../server/game.js');
const { handleCommand } = await import('../../server/commands/index.js');
const files = ['../../scripts/lib/script-gen.mjs','../../public/js/script-engine.js','../../puffer_adapter/script_controller.mjs'];
const hash = () => { const sum = createHash('sha256'); for (const file of files) sum.update(readFileSync(new URL(file, import.meta.url))); return sum.digest('hex'); };
const beforeHash = hash();
let game, clock, host;
try {
  migrate();
  const account = await registerAccount('NativeHallFixture', 'disposable-fixture-only');
  const player = loadPlayer(createCharacter(account.accountId, {name:'NativeHallFixture',race:'gortog',guild:'barbarian'}));
  clock = virtualClock(); game = new Game(); game.init(); game.addPlayer(player);
  const beforeSilver = player.silver, expertiseBefore = player.skills.expertise.exp;
  const commands = [], rooms = [], messages = [], payments = []; let combatStarted = false;
  // Authored plan only: native starter money pays for the real guild lesson.
  const generated = productionLibrary({room:player.room,arena:'sewers_3',circle:1,character:player.name,phase:'hall',trainList:['expertise','melee_mastery']});
  player.ws = {readyState:1,send(raw) {
    const frame = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (frame.t === 'room') rooms.push(frame.roomId);
    if (frame.msg) { messages.push(frame.msg.replace(/\x1b\[[0-9;]*m/g,'')); host?.feed(frame.msg,frame.t); }
    if (player.combatId) combatStarted = true;
  }};
  host = scriptController({library:generated.library,entry:generated.entry,isolated:true,roomNow:()=>player.room,commandCap:100,simulatedSecondsCap:300,
    send:line=>{
      commands.push(line);
      const silverBefore = player.silver, skillBefore = player.skills.expertise.exp;
      handleCommand(game,player,line,0,{applyRT:true});
      payments.push({command:line,silverBefore,silverAfter:player.silver,expertiseBefore:skillBefore,expertiseAfter:player.skills.expertise.exp});
    }});
  host.start();
  for (let ticks=0;ticks<3000&&!host.state.stopped&&!host.state.cycle_finished;ticks++) {host.pump();clock.advance(100);}
  const completed = host.state.cycle_finished;
  host.stop('fixture_complete'); const stoppedCount = commands.length; clock.advance(1000); host.pump();
  const lesson = messages.find(text=>/drills you in Expertise/.test(text));
  const lessonCost = Number(/\((\d+) silvers\)/.exec(lesson ?? '')?.[1] ?? 0);
  process.stdout.write(JSON.stringify({completed,commands,rooms,messages,payments,room:player.room,circle:player.circle,
    silverSpent:beforeSilver-player.silver,lessonCost,expertiseBefore,expertiseAfter:player.skills.expertise.exp,
    death:Boolean(player.lastCorpse)||player.hp<=0,combatStarted,commandsAfterStop:commands.length-stoppedCount,
    sourceUnchanged:hash()===beforeHash,databaseIsolated:true,grantsUsed:false})+'\n');
} finally {host?.stop();game?.stop();clock?.close();closeDb();rmSync(directory,{recursive:true,force:true});}
