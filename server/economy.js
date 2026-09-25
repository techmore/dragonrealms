// Economy: shops, banking, healing, commodity pits.
import { roomById, ROOMS } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { ITEMS, itemById } from '../data/items.js';
import { commodityPrice, commodityById, commodityHoldings } from '../data/commodities.js';
import {
  addItem, removeItem, removeItemInstances, countItems, gainSkillExp,
  unlockAchievement, isStackableItem, instanceMetadata, savePlayer,
} from './player.js';
import { db } from './db.js';
import { transferInventory } from './inventory-transfer.js';
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

const methods = {
  shopNpcsIn(p) {
    const room = roomById(p.room);
    return (room.npcs || []).map((id) => this.shops.get(id)).filter(Boolean);
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

  // D1 companion: purchases now deplete real stock, so shopkeepers slowly
  // restock toward their configured levels (one unit per entry per tick).
  // Targets are captured when this economy is created, before any purchase.
  restockTick() {
    for (const [shop, targets] of this.shopTargets) {
      for (const [id, want] of Object.entries(targets)) {
        if ((shop.stock[id] ?? 0) < want) shop.stock[id] = (shop.stock[id] ?? 0) + 1;
      }
    }
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
    transferInventory([p], () => {
      p.silver -= cost;
      addItem(p, target.item.id, qty);
    });
    // D1 fix: decrement the shop's ACTUAL stock (previously `target.q` was a
    // copied primitive, so every shop sold infinitely and listShop never
    // changed).
    target.shop.stock[target.item.id] = Math.max(0, (target.shop.stock[target.item.id] ?? 0) - qty);
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
    let mult = p.circle >= 10 && p.guild?.id === 'trader' ? 1.25 : 1;
    if (p.caravan && p.caravan.rented && p.caravan.porter > 0) mult += 0.05;
    let chaffered = false;
    if (p.chafferNext) {
      mult += 0.1;
      chaffered = true;
    }
    const price = Math.floor(item.value * 0.5 * mult) * qty;
    transferInventory([p], () => {
      removeItem(p, item.id, qty);
      p.silver += price;
    });
    if (chaffered) p.chafferNext = false;
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
    const before = { silver: p.silver, bank: p.bank };
    p.silver -= amt;
    p.bank += amt;
    try { savePlayer(p); }
    catch (error) {
      p.silver = before.silver; p.bank = before.bank;
      return { ok: false, msg: 'The ledger could not be saved; the deposit was not accepted.' };
    }
    if (p.bank >= 2000) unlockAchievement(p, 'nest_egg');
    return { ok: true, msg: `You deposit ${amt} silvers. Your bank holds ${p.bank}.` };
  },

  withdraw(p, amt) {
    if (!this.bankerIn(p)) return { ok: false, msg: 'There is no banker here.' };
    amt = Math.max(1, Math.floor(amt));
    if (p.bank < amt) return { ok: false, msg: 'Your bank does not hold that much.' };
    const before = { bank: p.bank, silver: p.silver };
    p.bank -= amt;
    p.silver += amt;
    try { savePlayer(p); }
    catch (error) {
      p.bank = before.bank; p.silver = before.silver;
      return { ok: false, msg: 'The ledger could not be saved; the withdrawal was not accepted.' };
    }
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
    transferInventory([p], () => {
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
    });
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
    transferInventory([p], () => {
      addItem(p, found.item_id, qty, retrievedMetadata);
      const left = found.qty - qty;
      if (left <= 0) db.prepare('DELETE FROM vault WHERE character_id=? AND item_id=?').run(p.charId, found.item_id);
      else db.prepare('UPDATE vault SET qty=?, metadata=? WHERE character_id=? AND item_id=?')
        .run(left, JSON.stringify(storedMetadata.slice(qty)), p.charId, found.item_id);
    });
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
    const before = { silver: p.silver, hp: p.hp, mana: p.mana };
    p.silver -= cost;
    p.hp = p.maxHp;
    if (p.guild?.magic) p.mana = p.maxMana;
    try { savePlayer(p); }
    catch (error) {
      p.silver = before.silver; p.hp = before.hp; p.mana = before.mana;
      return { ok: false, msg: 'The healer could not record the transaction; no silvers were spent.' };
    }
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
      const before = { silver: p.silver, holdings: structuredClone(holdings) };
      p.silver -= cost;
      const cur = holdings[def.id] || { qty: 0, avgCost: 0 };
      cur.avgCost = cur.qty ? (cur.avgCost * cur.qty + cost) / (cur.qty + qty) : Math.ceil(price * 1.08);
      cur.qty += qty;
      holdings[def.id] = cur;
      try { savePlayer(p); }
      catch (error) {
        p.silver = before.silver;
        p.commodities = before.holdings;
        return { ok: false, msg: 'The pit ledger could not be saved; the purchase was not accepted.' };
      }
      gainSkillExp(p, 'trading', 6);
      return { ok: true, msg: `You buy ${qty} unit(s) of ${def.name} at ${Math.ceil(price * 1.08)} silvers each.` };
    }

    const cur = holdings[def.id];
    if (!cur || cur.qty < qty) return { ok: false, msg: `You hold ${cur ? cur.qty : 0} unit(s) of ${def.name}.` };
    let trader = p.guild?.id === 'trader' ? 1.1 : 1;
    // A caravan scribe keeps better books at the board.
    if (p.caravan && p.caravan.rented && p.caravan.scribe > 0) trader += 0.1;
    const proceeds = Math.floor(Math.floor(price * 0.92) * qty * trader);
    const profit = proceeds - Math.floor(cur.avgCost * qty);
    const before = { silver: p.silver, holdings: structuredClone(holdings) };
    cur.qty -= qty;
    if (cur.qty <= 0) delete holdings[def.id];
    p.silver += proceeds;
    try { savePlayer(p); }
    catch (error) {
      p.silver = before.silver;
      p.commodities = before.holdings;
      return { ok: false, msg: 'The pit ledger could not be saved; the sale was not accepted.' };
    }
    gainSkillExp(p, 'trading', 8);
    return { ok: true, msg: `You sell ${qty} unit(s) of ${def.name} for ${proceeds} silvers${trader > 1.1 ? ' (caravan books!)' : trader > 1 ? ' (Golden Touch!)' : ''} — ${profit >= 0 ? 'a profit' : 'a loss'} of ${Math.abs(profit)}.` };
  },
};


// Content remains unchanged: stock and configured maxima belong to one world.
export function createEconomy() {
  const shops = new Map();
  const shopTargets = new Map();
  for (const room of Object.values(ROOMS)) {
    for (const id of room.npcs || []) {
      const definition = npcById(id);
      if (definition?.role !== 'shop' || shops.has(id)) continue;
      const shop = { ...definition, stock: { ...definition.stock }, buys: [...(definition.buys || [])] };
      shops.set(id, shop);
      shopTargets.set(shop, Object.freeze({ ...definition.stock }));
    }
  }
  return Object.assign(Object.create(methods), { shops, shopTargets });
}

// Compatibility for direct callers. Games always construct their own economy.
export const economy = createEconomy();
