// Economy: shops, banking, healing, commodity pits.
import { roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { ITEMS, itemById } from '../data/items.js';
import { commodityPrice, commodityById, commodityHoldings } from '../data/commodities.js';
import {
  addItem, removeItem, removeItemInstances, countItems, gainSkillExp,
  unlockAchievement, isStackableItem, instanceMetadata,
} from './player.js';
import { db } from './db.js';
import { pad } from './util.js';

function weaponString(item) {
  if (item.type !== 'weapon') return '';
  return `${item.dmg[0]}-${item.dmg[1]}`;
}

function vaultMetadata(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const economy = {
  shopNpcsIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).filter((n) => n && n.role === 'shop');
  },

  listShop(p) {
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const blocks = shops.map((shop) => {
      const rows = Object.entries(shop.stock).map(([id, qty]) => {
        const it = itemById(id);
        if (!it) return null;
        return `${pad(it.name, 30)} ${pad(weaponString(it), 8)} ${pad(`${it.value} silvers`, 14)} ${qty} in stock`;
      }).filter(Boolean);
      return `${shop.name}\n${rows.join('\n')}`;
    });
    return { ok: true, msg: `\n${blocks.join('\n\n')}\n\nSay "buy <item>" to purchase. Some vendors also buy hides and skins.` };
  },

  buy(p, itemName, qty = 1) {
    qty = Math.max(1, Math.min(100, Math.floor(qty) || 1));
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const entries = shops
      .flatMap((shop) => Object.entries(shop.stock).map(([id, q]) => ({ shop, item: itemById(id), q })))
      .filter((e) => e.item);
    // Prefer exact id matches over substring name matches, so "buy leather"
    // finds the leather jerkin even after a "braided leather sling" exists.
    const target = entries.find((e) => e.item.id === itemName)
      || entries.find((e) => e.item.name.includes(itemName));
    if (!target) return { ok: false, msg: 'They do not sell that here.' };
    if (target.q < qty) return { ok: false, msg: 'They do not have that many in stock.' };
    const cost = target.item.value * qty;
    if (p.silver < cost) return { ok: false, msg: `You cannot afford ${cost} silvers.` };
    p.silver -= cost;
    addItem(p, target.item.id, qty);
    target.q -= qty;
    return { ok: true, msg: `You buy ${qty > 1 ? `${qty}x ` : ''}${target.item.name} for ${cost} silvers.` };
  },

  sell(p, itemName, qty = 1) {
    qty = Math.max(1, Math.min(100, Math.floor(qty) || 1));
    const shops = this.shopNpcsIn(p);
    if (!shops.length) return { ok: false, msg: 'There is no shopkeeper here.' };
    const item = itemById(itemName) || Object.values(ITEMS).find((i) => i.name.includes(itemName));
    if (!item) return { ok: false, msg: 'You do not have that.' };
    const willing = shops.find((shop) => shop.buys.includes(item.id));
    if (!willing) return { ok: false, msg: 'No one here is interested in buying that.' };
    const have = countItems(p, item.id);
    if (have < qty) return { ok: false, msg: 'You do not have that many.' };
    // Golden Touch (circle-10 trader), caravan porter, and a chaffered bargain
    // stack on the shop's half-price rate.
    let mult = p.circle >= 10 && p.guild.id === 'trader' ? 1.25 : 1;
    if (p.caravan && p.caravan.rented && p.caravan.porter > 0) mult += 0.05;
    let chaffered = false;
    if (p.chafferNext) {
      mult += 0.1;
      chaffered = true;
      p.chafferNext = false;
    }
    const price = Math.floor(item.value * 0.5 * mult) * qty;
    removeItem(p, item.id, qty);
    p.silver += price;
    gainSkillExp(p, 'trading', 4);
    const notes = [];
    if (mult > 1.25) notes.push('your caravan earns its keep');
    if (chaffered) notes.push('the chaffer carried the day');
    return { ok: true, msg: `You sell ${qty > 1 ? `${qty}x ` : ''}${item.name} to ${willing.name} for ${price} silvers.${mult > 1 ? ' (Golden Touch!)' : ''}${notes.length ? ` (${notes.join('; ')})` : ''}` };
  },

  bankerIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).find((n) => n && n.role === 'bank');
  },

  deposit(p, amt) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    amt = Math.max(1, Math.floor(amt));
    if (p.silver < amt) return { ok: false, msg: 'You do not have that many silvers.' };
    p.silver -= amt;
    p.bank += amt;
    if (p.bank >= 2000) unlockAchievement(p, 'nest_egg');
    return { ok: true, msg: `You deposit ${amt} silvers. Your bank holds ${p.bank}.` };
  },

  withdraw(p, amt) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    amt = Math.max(1, Math.floor(amt));
    if (p.bank < amt) return { ok: false, msg: 'Your bank does not hold that much.' };
    p.bank -= amt;
    p.silver += amt;
    return { ok: true, msg: `You withdraw ${amt} silvers.` };
  },

  // ---------- Bank vault (item storage) ----------
  vaultList(p) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    const rows = db.prepare('SELECT item_id, qty FROM vault WHERE character_id=? ORDER BY item_id').all(p.charId);
    if (!rows.length) return { ok: true, msg: 'Your vault is empty. Store belongings with "store <item> [qty]" and take them back with "retrieve <item> [qty]".' };
    const lines = rows.map((r) => {
      const it = itemById(r.item_id);
      return `  ${it ? it.name : r.item_id}${r.qty > 1 ? ` (${r.qty})` : ''}`;
    });
    return { ok: true, msg: `\nYour bank vault holds:\n${lines.join('\n')}` };
  },

  vaultStore(p, itemName, qty = 1) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    const entry = p.inventory.find((e) => e.item.id === itemName || e.item.name.includes(itemName));
    if (!entry) return { ok: false, msg: 'You do not have that.' };
    qty = Math.max(1, Math.min(countItems(p, entry.item.id), Math.floor(qty) || 1));
    const removed = removeItemInstances(p, entry.item.id, qty, entry);
    const prior = db.prepare('SELECT qty, metadata FROM vault WHERE character_id=? AND item_id=?')
      .get(p.charId, entry.item.id);
    const metadata = isStackableItem(entry.item)
      ? []
      : [...vaultMetadata(prior?.metadata), ...removed.map(instanceMetadata)];
    db.prepare(`
      INSERT INTO vault (character_id, item_id, qty, metadata) VALUES (?,?,?,?)
      ON CONFLICT(character_id, item_id) DO UPDATE SET qty=excluded.qty, metadata=excluded.metadata
    `).run(p.charId, entry.item.id, (prior?.qty || 0) + qty, JSON.stringify(metadata));
    return { ok: true, msg: `You store ${qty > 1 ? `${qty}x ` : ''}${entry.item.name} in your vault.` };
  },

  vaultRetrieve(p, itemName, qty = 1) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    const row = db.prepare('SELECT item_id, qty, metadata FROM vault WHERE character_id=? AND item_id=?').get(p.charId, itemName);
    const found = row || db.prepare('SELECT item_id, qty, metadata FROM vault WHERE character_id=?').all(p.charId)
      .find((r) => { const it = itemById(r.item_id); return it && it.name.includes(itemName); });
    if (!found) return { ok: false, msg: 'Your vault holds nothing like that.' };
    qty = Math.max(1, Math.min(found.qty, Math.floor(qty) || 1));
    const it = itemById(found.item_id);
    const storedMetadata = vaultMetadata(found.metadata);
    const retrievedMetadata = it && !isStackableItem(it)
      ? Array.from({ length: qty }, (_, i) => instanceMetadata(storedMetadata[i] || {}))
      : null;
    addItem(p, found.item_id, qty, retrievedMetadata);
    const left = found.qty - qty;
    if (left <= 0) db.prepare('DELETE FROM vault WHERE character_id=? AND item_id=?').run(p.charId, found.item_id);
    else db.prepare('UPDATE vault SET qty=?, metadata=? WHERE character_id=? AND item_id=?')
      .run(left, JSON.stringify(storedMetadata.slice(qty)), p.charId, found.item_id);
    return { ok: true, msg: `You retrieve ${qty > 1 ? `${qty}x ` : ''}${it ? it.name : found.item_id} from your vault.` };
  },

  healerIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map(npcById).find((n) => n && n.role === 'healer');
  },

  heal(p) {
    if (!this.healerIn(p)) return { ok: false, msg: 'There is no healer here.' };
    const cost = Math.max(5, Math.floor((p.maxHp - p.hp) * 0.1));
    if (p.silver < cost) return { ok: false, msg: `The healer wants ${cost} silvers and you have ${p.silver}.` };
    if (p.hp >= p.maxHp) return { ok: false, msg: 'You are already in full health.' };
    p.silver -= cost;
    p.hp = p.maxHp;
    if (p.guild.magic) p.mana = p.maxMana;
    return { ok: true, msg: `Sister Cora closes her eyes and channels warmth through your body. You are restored for ${cost} silvers.` };
  },

  // ---------- Commodity pits ----------
  commodityBoard(p) {
    const rows = [];
    for (const id of ['grain', 'wool', 'silk', 'spices']) {
      const price = commodityPrice(id);
      const held = commodityHoldings(p)[id];
      rows.push(`  ${pad(id, 8)} ${price} silvers/unit${held && held.qty ? `  (you hold ${held.qty} @ ~${Math.round(held.avgCost)})` : ''}`);
    }
    return `\nThe board flickers with the hour:\n${rows.join('\n')}\nBuy and sell with "buy <commodity> <qty>" and "sell <commodity> <qty>".`;
  },

  commodityTrade(p, side, name, qty) {
    if (p.room !== 'commodity_pit') return { ok: false, msg: 'The board only moves at the Grain Pit, north of Market Way.' };
    const def = commodityById(name);
    if (!def) return { ok: false, msg: 'No such commodity. The pit trades grain, wool, silk, and spices.' };
    qty = Math.max(1, Math.min(200, Math.floor(qty) || 1));
    const price = commodityPrice(def.id);
    const holdings = commodityHoldings(p);

    if (side === 'buy') {
      // Pit spread (economy audit F6): the floor broker buys high and pays
      // low — 8% each way. Impatient traders bleed silver; skilled ones who
      // ride the sine still profit, but nothing here is free.
      const cost = Math.ceil(price * 1.08) * qty;
      if (p.silver < cost) return { ok: false, msg: `That costs ${cost} silvers; you have ${p.silver}.` };
      p.silver -= cost;
      const cur = holdings[def.id] || { qty: 0, avgCost: 0 };
      cur.avgCost = cur.qty ? (cur.avgCost * cur.qty + cost) / (cur.qty + qty) : Math.ceil(price * 1.08);
      cur.qty += qty;
      holdings[def.id] = cur;
      gainSkillExp(p, 'trading', 6);
      return { ok: true, msg: `You buy ${qty} unit(s) of ${def.name} at ${Math.ceil(price * 1.08)} silvers each.` };
    }

    const cur = holdings[def.id];
    if (!cur || cur.qty < qty) return { ok: false, msg: `You hold ${cur ? cur.qty : 0} unit(s) of ${def.name}.` };
    let trader = p.guild.id === 'trader' ? 1.1 : 1;
    // A caravan scribe keeps better books at the board.
    if (p.caravan && p.caravan.rented && p.caravan.scribe > 0) trader += 0.1;
    const proceeds = Math.floor(Math.floor(price * 0.92) * qty * trader);
    const profit = proceeds - Math.floor(cur.avgCost * qty);
    cur.qty -= qty;
    if (cur.qty <= 0) delete holdings[def.id];
    p.silver += proceeds;
    gainSkillExp(p, 'trading', 8);
    return { ok: true, msg: `You sell ${qty} unit(s) of ${def.name} for ${proceeds} silvers${trader > 1.1 ? ' (caravan books!)' : trader > 1 ? ' (Golden Touch!)' : ''} — ${profit >= 0 ? 'a profit' : 'a loss'} of ${Math.abs(profit)}.` };
  },
};
