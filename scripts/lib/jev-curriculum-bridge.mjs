// Independent Jev harness extension informed by the Puffer curriculum.
// It never invents a command: it can only return an action already present in
// the ordinary player's observed legal menu. The provider remains responsible
// for choices once the prerequisite kit is funded.
import { ITEMS } from '../../data/items.js';

export const JEV_CURRICULUM_BRIDGE_VERSION =
  'puffer-curriculum-bridge-v4-legal-menu-prefetch-floor';

// The native player keeps this overlay opt-in.  A pending Dragon Form action
// is still well above the native emergency-flee floor at 70% HP, while the
// old hard-coded 75% floor discarded legal ability uses after ordinary hits.
// This only changes the transformed Jev candidate, never the DR runtime.
export const JEV_CURRICULUM_BRIDGE_PREFETCH_HP_FLOOR = 0.70;

const BARBARIAN_KIT = Object.freeze([
  'dagger', 'club', 'broadsword', 'staff', 'padded_cloth', 'shield_wood',
]);

const ownedItemIds = state => new Set([
  ...(state?.purchasedItems || []),
  ...Object.values(state?.equipment || {}).flat().map(item => item?.id).filter(Boolean),
]);

/**
 * Return a curriculum action only when the Puffer-like prerequisite is
 * observable and the exact action is already legal. No economy is granted and
 * no native game code is changed.
 */
export function bridgeKitFundingAction(options = [], state = {}) {
  if (state.guild !== 'barbarian' || state.inCombat || state.quest?.done) return null;
  if (Number(state.hp) > 0 && Number(state.maxHp) > 0
      && Number(state.hp) < Math.floor(Number(state.maxHp) * 0.8)) return null;
  if ((state.bleeding || []).length) return null;

  const owned = ownedItemIds(state);
  const missing = BARBARIAN_KIT.filter(id => !owned.has(id) && ITEMS[id]);
  if (!missing.length) return null;
  const missingCost = missing.reduce((sum, id) => sum + Number(ITEMS[id].value || 0), 0);
  if (Number(state.silver) >= missingCost) return null;

  // The ordinary goal policy exposes these as legal menu entries. Prefer the
  // concrete purchase or the already-planned bazaar trip before falling back
  // to Performance as a funding activity. This keeps the bridge useful even
  // when Jev's answer would otherwise spend the turn on a non-funding action.
  const purchase = options.find(option => {
    const match = /^buy_(.+)$/.exec(String(option.id || ''));
    return match && missing.includes(match[1]) && ITEMS[match[1]];
  });
  if (purchase) return {
    action: purchase,
    reason: 'buy-offered-distinct-barbarian-kit-lane',
    missingItems: missing,
    missingCost,
    silver: Number(state.silver) || 0,
    phase: 'kit-purchase',
  };
  const bazaar = options.find(option => option.id === 'starter_kit');
  if (bazaar) return {
    action: bazaar,
    reason: 'route-to-offered-barbarian-kit-bazaar',
    missingItems: missing,
    missingCost,
    silver: Number(state.silver) || 0,
    phase: 'kit-purchase',
  };

  const crier = options.find(option => option.id === 'take_quest' || option.id === 'quest_crier');
  if (crier) return {
    action: crier,
    reason: 'take-offered-training-funds-quest-before-field-combat',
    missingItems: missing,
    missingCost,
    silver: Number(state.silver) || 0,
    phase: 'kit-funding',
  };

  const action = options.find(option => option.id === 'perform');
  if (!action) return null;
  return {
    action,
    reason: 'fund-required-barbarian-kit-before-combat-curriculum',
    missingItems: missing,
    missingCost,
    silver: Number(state.silver) || 0,
  };
}

const gapRows = state => (state?.requirements?.rows || [])
  .filter(row => Number(row.have) < Number(row.need));
const hasGap = (rows, predicate) => rows.some(row => predicate(row));
const optionSkills = option => {
  if (option.id === 'forage') return ['foraging'];
  if (option.id === 'hunt_signs') return ['perception'];
  if (option.id === 'practice_stealth') return ['stealth'];
  if (option.id === 'study_lore') return ['scholarship', 'appraisal'];
  if (/^appraise_/.test(option.id)) return ['appraisal'];
  if (/^skin_/.test(option.id)) return ['skinning'];
  return [];
};

/**
 * Puffer's transparent activity order, projected onto Jev's live legal menu.
 * This is deliberately advisory to the menu: it cannot synthesize travel,
 * combat, training, or economy commands that the ordinary player did not see.
 */
export function bridgeCurriculumAction(options = [], state = {}) {
  const kit = bridgeKitFundingAction(options, state);
  if (kit) return {...kit, phase:kit.phase || 'kit-funding'};
  if (state.guild !== 'barbarian' || state.inCombat
      || Number(state.hp) < Math.floor(Number(state.maxHp || 0) * 0.8)
      || (state.bleeding || []).length || state.quest?.done
      || (state.quest && !state.quest.done)) return null;

  const rows = gapRows(state);
  const supernatural = hasGap(rows, row => row.eligible?.some(skill =>
    ['inner_fire','augmentation','debilitation','targeted_magic','utility_magic','warding_magic'].includes(skill)));
  const learn = options.find(option => /^learn_ability_/.test(option.id));
  if (supernatural && learn)
    return {action:learn, phase:'supernatural', reason:'puffer-order-supernatural-prerequisite'};

  const lore = hasGap(rows, row => /lore$/i.test(String(row.label || '')));
  if (lore) {
    const study = options.find(option => option.id === 'study_lore' || option.id === 'lore_library');
    if (study) return {action:study, phase:'lore', reason:'puffer-order-distinct-lore-lane'};
    const appraisal = options.find(option => /^appraise_/.test(option.id));
    if (appraisal) return {action:appraisal, phase:'lore', reason:'puffer-order-appraisal-lore-lane'};
  }

  const survival = hasGap(rows, row => /survival$/i.test(String(row.label || '')));
  if (survival) {
    const candidates = options.filter(option => optionSkills(option).some(skill =>
      rows.some(row => row.eligible?.includes(skill))));
    candidates.sort((a,b) => {
      const rank = option => Math.min(...optionSkills(option).map(skill => Number(state.skills?.[skill]) || 0));
      return rank(a) - rank(b);
    });
    if (candidates[0]) return {action:candidates[0], phase:'survival', reason:'puffer-order-distinct-survival-lane'};
  }

  const weapon = hasGap(rows, row => /weapon$/i.test(String(row.label || '')));
  if (weapon) {
    const action = options.find(option => /^(?:buy|wield)_/.test(option.id)
      && ITEMS[option.id.replace(/^(?:buy|wield)_/, '')]?.type === 'weapon'
      && rows.some(row => row.eligible?.includes(ITEMS[option.id.replace(/^(?:buy|wield)_/, '')]?.skill)));
    if (action) return {action, phase:'weapons', reason:'puffer-order-distinct-weapon-lane'};
  }
  return null;
}

const SUPERVISED = '      repeatedOverrideReleaseAfter,\n    });';
const START_EVENT = "log({ type: 'start', char: name, user, origin: session.origin });";

/** Source hook used only by the opt-in preload. It fails closed on drift. */
export function instrumentJevCurriculumBridgeSource(source, { extensionHash = null } = {}) {
  if (typeof source !== 'string') throw new TypeError('Jev player source must be text');
  for (const [label, anchor] of [['supervised choice', SUPERVISED], ['start event', START_EVENT]]) {
    const count = source.split(anchor).length - 1;
    if (count !== 1) throw new Error(`Expected one ${label} anchor; found ${count}`);
  }
  const imported = `import { bridgeCurriculumAction, JEV_CURRICULUM_BRIDGE_VERSION } from './lib/jev-curriculum-bridge.mjs';\n`;
  let transformed = source.startsWith('#!')
    ? source.replace(/^(.*\n)/, `$1${imported}`)
    : imported + source;
  const prefetchFloorLiteral = 'minHpFraction:0.75';
  const prefetchFloorCount = transformed.split(prefetchFloorLiteral).length - 1;
  if (prefetchFloorCount !== 2)
    throw new Error(`Expected two RT ability safety anchors; found ${prefetchFloorCount}`);
  transformed = transformed.replaceAll(prefetchFloorLiteral,
    'minHpFraction:JEV_CURRICULUM_BRIDGE_PREFETCH_HP_FLOOR');
  transformed = transformed.replace(
    "import { bridgeCurriculumAction, JEV_CURRICULUM_BRIDGE_VERSION } from './lib/jev-curriculum-bridge.mjs';",
    "import { bridgeCurriculumAction, JEV_CURRICULUM_BRIDGE_VERSION, JEV_CURRICULUM_BRIDGE_PREFETCH_HP_FLOOR } from './lib/jev-curriculum-bridge.mjs';");
  const insert = `
    const curriculumBridge = bridgeCurriculumAction(options, {
      guild:guildId, inCombat:session.vitals.inCombat,
      hp:session.vitals.hp, maxHp:session.vitals.maxhp, silver:session.vitals.silver,
      quest:state.quest, bleeding:session.vitals.bleeding || [],
      purchasedItems:[...purchasedItems], equipment:session.vitals.equipment,
    });
    if (curriculumBridge) {
      selectedResult={action:curriculumBridge.action,probability:null,
        probabilities:selectedResult?.probabilities || {}, confidence:selectedResult?.confidence,
        overrideReason:curriculumBridge.reason};
      manifest.curriculumBridge ??= {version:JEV_CURRICULUM_BRIDGE_VERSION,decisions:0};
      manifest.curriculumBridge.decisions++;
      log({type:'curriculum-bridge-choice',action:curriculumBridge.action.id,
        phase:curriculumBridge.phase,missingItems:curriculumBridge.missingItems,missingCost:curriculumBridge.missingCost,
        silver:curriculumBridge.silver,reason:curriculumBridge.reason});
    }
`;
  transformed = transformed.replace(SUPERVISED, SUPERVISED + insert);
  transformed = transformed.replace(START_EVENT,
    `${START_EVENT}\nlog({type:'harness-extension',id:'jev-curriculum-bridge',version:JEV_CURRICULUM_BRIDGE_VERSION,prefetchHpFloor:JEV_CURRICULUM_BRIDGE_PREFETCH_HP_FLOOR,sourceHash:${JSON.stringify(extensionHash)}});`);
  return transformed;
}
