import test from 'node:test';
import assert from 'node:assert/strict';
import { clientFeatureSpec, encodeClientObservation, parseWireExperience } from '../puffer_adapter/client_contract.mjs';

const experience = {
  t: 'msg',
  msg: '\nExperience\n  Small Edged              rank 0    275% mind lock\n\nGuild circle progress (next: 2):',
};

const prompt = {
  t: 'prompt',
  msg: '\n\x1b[36mHP: 100/100\x1b[0m  Fire: 20/30  Stamina: 70/80  Circle 1  50 silvers \n> ',
  requirements: { circle: 2, rows: [{ label: '1st weapon', have: 3, need: 4 }] },
};

test('ordinary-client experience accepts rank-progress percentages above 100', () => {
  const parsed = parseWireExperience(experience, ['Small Edged']);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.skills['Small Edged'].mindstate_percent, 275);
  assert.equal(parsed.skills['Small Edged'].mindstate, 'mind lock');
});

test('ordinary-client observation clamps over-100 learning features without hiding telemetry', () => {
  const spec = clientFeatureSpec({
    guild: 'barbarian',
    race: 'gortog',
    actions: ['study'],
    requirementLabels: ['1st weapon'],
    skillNames: ['Small Edged'],
    gearNames: [],
    roomIds: ['academy'],
  });
  const encoded = encodeClientObservation(spec, {
    prompt,
    room: { roomId: 'academy' },
    experience,
    inventory: { t: 'msg', msg: '\nYou are carrying: nothing.\nWorn: nothing.\nYou are lightly burdened.\nSilvers: 5.' },
    guild: 'barbarian',
    race: 'gortog',
  });
  const feature = spec.features.indexOf('learning_percent:Small Edged');
  assert.equal(encoded.observation[feature], 1);
  assert.equal(encoded.exact_skill_exp, null);
  assert.equal(encoded.experience_pools, null);
});
