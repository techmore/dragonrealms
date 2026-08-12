// Shop and service commands: market, bank, healer, trader caravans.
import { skillRank, gainSkillExp } from '../player.js';

export const commands = {
  list(ctx) {
    const { game, p, emit } = ctx;
    const res = game.listShop(p);
    emit(res.msg);
  },

  buy(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Buy what?');
    const qty = parseInt(arg2, 10) || 1;
    // At the pit, "buy <commodity> <qty>" trades on the board.
    if (p.room === 'commodity_pit') {
      const res = game.commodityTrade(p, 'buy', arg1, qty);
      if (res.ok) return emit(res.msg);
    }
    const res = game.buy(p, arg1, qty);
    emit(res.msg);
  },

  sell(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Sell what?');
    const qty = parseInt(arg2, 10) || 1;
    if (p.room === 'commodity_pit') {
      const res = game.commodityTrade(p, 'sell', arg1, qty);
      if (res.ok) return emit(res.msg);
    }
    const res = game.sell(p, arg1, qty);
    emit(res.msg);
  },

  pit(ctx) {
    const { game, p, emit } = ctx;
    if (p.room !== 'commodity_pit') return emit('The pit hall stands west of Market Way.');
    emit(game.commodityBoard(p));
  },

  deposit(ctx) {
    const { game, p, arg1, emit } = ctx;
    const amt = parseInt(arg1, 10);
    if (!amt) return emit('Deposit how many silvers?');
    const res = game.deposit(p, amt);
    emit(res.msg);
  },

  withdraw(ctx) {
    const { game, p, arg1, emit } = ctx;
    const amt = parseInt(arg1, 10);
    if (!amt) return emit('Withdraw how many silvers?');
    const res = game.withdraw(p, amt);
    emit(res.msg);
  },

  vault(ctx) {
    const { game, p, emit } = ctx;
    const res = game.vaultList(p);
    emit(res.msg);
  },

  store(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Store what?');
    const qty = parseInt(arg2, 10) || 1;
    const res = game.vaultStore(p, arg1, qty);
    emit(res.msg);
  },

  retrieve(ctx) {
    const { game, p, arg1, arg2, emit } = ctx;
    if (!arg1) return emit('Retrieve what?');
    const qty = parseInt(arg2, 10) || 1;
    const res = game.vaultRetrieve(p, arg1, qty);
    emit(res.msg);
  },

  heal(ctx) {
    const { game, p, emit } = ctx;
    const res = game.heal(p);
    emit(res.msg);
  },

  caravan(ctx) { caravan(ctx); },

  chaffer(ctx) {
    const { game, p, emit } = ctx;
    if (p.guild.id !== 'trader') return emit('Only traders know how to chaffer.');
    if (!game.shopNpcsIn(p).length) return emit('Chaffer with whom? You need a shopkeeper nearby.');
    p.chafferNext = true;
    emit('You roll your shoulders and crack your knuckles — the next sale will run 10% better. ("sell <item>" when you are ready.)');
  },

  speculate(ctx) {
    const { game, p, emit } = ctx;
    if (p.room !== 'commodity_pit') return emit('Speculation happens at the Grain Pit, west of Market Way.');
    const stake = 50;
    if (p.silver < stake) return emit(`Speculation costs ${stake} silvers, and you are short.`);
    p.silver -= stake;
    const trading = skillRank(p, 'trading');
    const appraisal = skillRank(p, 'appraisal');
    const chance = Math.min(0.85, 0.35 + trading * 0.01 + appraisal * 0.005);
    const leveled = gainSkillExp(p, 'trading', 8);
    if (Math.random() < chance) {
      const back = stake + Math.floor(stake * (0.5 + Math.random()));
      p.silver += back;
      emit(`You bet on the swing and the board delivers — ${back} silvers come back to you.${leveled ? ' Your Trading improved!' : ''}`);
    } else {
      emit(`The board swings against you and the ${stake} silvers are gone.${leveled ? ' Your Trading improved!' : ''}`);
    }
  },
};

// Trader caravan: rent a caravan at the guildhall, hire hands, take a cut
// of every sale (DR: RENT caravan / hirelings / TIE).
function caravan(ctx) {
  const { game, p, arg1, emit } = ctx;
  if (p.guild.id !== 'trader') return emit('Only traders run caravans.');
  if (!arg1) {
    if (!p.caravan || !p.caravan.rented) {
      return emit('You run no caravan. Rent one at the trader guildhall: "caravan rent" (150 silvers).');
    }
    return emit(`\nYour caravan (rented):\n  Porter: ${p.caravan.porter || 0} (+5% on every shop sale)\n  Scribe: ${p.caravan.scribe || 0} (+10% on pit sales)\n\n"caravan hire porter|scribe" (60 silvers each), "caravan sell" to sell it back for 50.`);
  }
  const what = arg1.toLowerCase();
  if (what === 'rent') {
    if (p.room !== 'hall_trader') return emit('Caravans are rented at the trader guildhall.');
    if (p.caravan && p.caravan.rented) return emit('You already run a caravan.');
    if (p.silver < 150) return emit('Renting a caravan costs 150 silvers.');
    p.silver -= 150;
    p.caravan = { rented: true, porter: 0, scribe: 0 };
    gainSkillExp(p, 'trading', 10);
    return emit('You rent a covered wagon and a pair of mules. The road is open — and every sale pays a little extra.');
  }
  if (what === 'sell') {
    if (!p.caravan || !p.caravan.rented) return emit('You have no caravan to sell.');
    p.silver += 50;
    p.caravan = null;
    return emit('You sell the wagon and mules back to the guild for 50 silvers.');
  }
  if (what === 'hire') {
    if (!p.caravan || !p.caravan.rented) return emit('Rent a caravan before hiring hands.');
    if (p.room !== 'hall_trader') return emit('Hirelings sign on at the trader guildhall.');
    const kind = (ctx.arg2 || '').toLowerCase();
    if (!['porter', 'scribe'].includes(kind)) return emit('Hire whom? "caravan hire porter" or "caravan hire scribe".');
    const cur = p.caravan[kind] || 0;
    if (cur >= 1) return emit(`You already keep a ${kind}.`);
    if ((p.caravan.porter || 0) + (p.caravan.scribe || 0) >= 2) return emit('Your wagon has no more berths (max 2 hirelings).');
    if (p.silver < 60) return emit('Hiring costs 60 silvers.');
    p.silver -= 60;
    p.caravan[kind] = cur + 1;
    gainSkillExp(p, 'trading', 6);
    return emit(kind === 'porter'
      ? 'A burly porter climbs aboard — he carries your goods and your haggling carries further (+5% shop sales).'
      : 'A pale scribe takes the seat by the driver — the pit board will favor your books (+10% pit sales).');
  }
  return emit('Caravan what? Try "caravan rent", "caravan hire porter|scribe", or "caravan sell".');
}
