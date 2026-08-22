// PvP, parties, and the auction house — extracted from game.js (B1 modularity
// pass). Functions take `game` first when they need world state; Game keeps
// one-line delegating methods so callers are unchanged.
import { roomById } from '../data/world.js';
import { db } from './db.js';
import { addItem, removeItemInstances, gainSkillExp } from './player.js';

// ---------- Duels ----------
export function canDuelHere(game, p) {
  const room = roomById(p.room);
  return Boolean(room && room.zone !== 'town' && room.zone !== 'riverhaven');
}

export function challengeDuel(game, p, targetName, end = 'blood', reason = '') {
  if (!canDuelHere(game, p)) return { ok: false, msg: 'The town guards do not permit duels here. Take it to the wilds.' };
  if (p.combatId) return { ok: false, msg: 'You are already in combat.' };
  // Paladins may not strike first (code of honor).
  if (p.guild.id === 'paladin') {
    p.soul = Math.max(0, (p.soul ?? 50) - 5);
    p.ws.send(JSON.stringify({ t: 'msg', msg: 'Your oath forbids striking first. Your soul dims slightly. (-5 soul)' }));
  }
  const n = targetName.toLowerCase();
  const target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === n);
  if (!target) return { ok: false, msg: 'There is no such adventurer here.' };
  if (target.combatId) return { ok: false, msg: `${target.name} is already in combat.` };
  if (!['blood', 'blow', 'pain'].includes(end)) end = 'blood';
  const endLabel = { blood: 'first blood runs', blow: 'the first solid blow lands', pain: 'one side is badly hurt' }[end];

  if (target.pvpStance === 'closed') {
    return { ok: false, msg: `${target.name} stands CLOSED to all challenges.` };
  }
  const reasonLine = reason ? ` — "${reason}"` : '';
  if (target.pvpStance === 'open') {
    // OPEN: no consent needed — the duel begins at once.
    const res = game.combat.startDuel(p, target, end);
    if (!res.ok) return { ok: false, msg: res.error };
    res.combat.say(`\n\x1b[1mThe duel begins! ${p.name} faces ${target.name} (ends when ${endLabel}).${reasonLine}\x1b[0m`);
    res.combat.startAttack();
    game.status(p);
    game.status(target);
    return { ok: true, msg: `${target.name} stands OPEN — the duel begins! (Ends when ${endLabel}.)${reasonLine}` };
  }

  const key = `${p.charId}|${target.charId}`;
  game.pendingDuels.set(key, { initiator: p.charId, target: target.charId, createdAt: Date.now(), end, reason });
  target.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1m${p.name} challenges you to a duel!\x1b[0m (ends when ${endLabel})${reasonLine} Type "accept ${p.name}" or "decline ${p.name}".` }));
  return { ok: true, msg: `You challenge ${target.name} to a duel (ends when ${endLabel})${reasonLine}. They must "accept" it to begin.` };
}

export function acceptDuel(game, p, initiatorName) {
  const n = initiatorName.toLowerCase();
  const initiator = [...game.players.values()].find((o) => o.name.toLowerCase() === n);
  if (!initiator) return { ok: false, msg: 'There is no such adventurer here.' };
  const key = `${initiator.charId}|${p.charId}`;
  const pending = game.pendingDuels.get(key);
  if (!pending) return { ok: false, msg: 'You have no pending duel with them.' };
  game.pendingDuels.delete(key);
  if (Date.now() - pending.createdAt > 60 * 1000) return { ok: false, msg: 'That duel offer has expired.' };
  if (initiator.room !== p.room) return { ok: false, msg: 'They are no longer in the room.' };
  if (initiator.combatId || p.combatId) return { ok: false, msg: 'Someone has already entered combat.' };
  if (!canDuelHere(game, p)) return { ok: false, msg: 'The town guards do not permit duels here.' };

  const res = game.combat.startDuel(initiator, p, pending.end || 'blood');
  if (!res.ok) return { ok: false, msg: res.error };
  const combat = res.combat;
  const endLabel = { blood: 'first blood runs', blow: 'the first solid blow lands', pain: 'one side is badly hurt' }[combat.duelEnd] || 'first blood runs';
  combat.say(`\n\x1b[1mThe duel begins! ${initiator.name} faces ${p.name} (ends when ${endLabel}).\x1b[0m`);
  combat.startAttack();
  game.status(initiator);
  game.status(p);
  return { ok: true, msg: `The duel begins! Fight with "stance" and "retreat" to yield.` };
}

export function declineDuel(game, p, initiatorName) {
  const n = initiatorName.toLowerCase();
  const initiator = [...game.players.values()].find((o) => o.name.toLowerCase() === n);
  if (!initiator) return { ok: false, msg: 'There is no such adventurer here.' };
  const key = `${initiator.charId}|${p.charId}`;
  if (!game.pendingDuels.delete(key)) return { ok: false, msg: 'You have no pending duel with them.' };
  initiator.ws.send(JSON.stringify({ t: 'msg', msg: `${p.name} declines your duel.` }));
  return { ok: true, msg: `You decline the duel.` };
}

// ---------- Parties (DR hunt credit) ----------
export function partyInvite(game, p, targetName) {
  if (p.combatId) return { ok: false, msg: 'Not in the middle of a fight.' };
  const target = [...game.players.values()].find((o) => o !== p && o.room === p.room && o.name.toLowerCase() === (targetName || '').toLowerCase());
  if (!target) return { ok: false, msg: 'There is no such adventurer here.' };
  if (target.party) return { ok: false, msg: `${target.name} is already in a party.` };
  target.pendingParty = p.charId;
  target.ws.send(JSON.stringify({ t: 'msg', msg: `\n${p.name} asks you to join their party. Type "party join" to accept.` }));
  return { ok: true, msg: `${target.name} has been asked. They can "party join" to accept.` };
}

export function partyJoin(game, p) {
  const leaderId = p.pendingParty;
  if (!leaderId) return { ok: false, msg: 'You have no pending party invitation.' };
  const leader = game.players.get(leaderId);
  if (!leader || leader.party && leader.party.members.length >= 5) {
    return { ok: false, msg: 'The invitation has lapsed or the party is full.' };
  }
  const id = leader.party ? leader.party.id : `party_${leaderId}_${Date.now()}`;
  const members = leader.party ? [...leader.party.members] : [leaderId];
  if (members.length >= 5) return { ok: false, msg: 'The party is full (5).' };
  members.push(p.charId);
  const party = { id, leader: leaderId, members };
  leader.party = party;
  p.party = party;
  p.pendingParty = null;
  for (const mid of members) {
    const m = game.players.get(mid);
    if (m) m.party = party;
  }
  return { ok: true, msg: `You join ${leader.name}'s party. Hunt credit is shared in the same room.` };
}

export function partyLeave(game, p) {
  if (!p.party) return { ok: false, msg: 'You are not in a party.' };
  const id = p.party.id;
  const leader = game.players.get(p.party.leader);
  const members = (leader && leader.party && leader.party.id === id ? leader.party.members : []).filter((m) => m !== p.charId);
  if (leader && leader.party && leader.party.id === id) {
    if (members.length <= 1) leader.party = null;
    else leader.party = { id, leader: leader.charId, members };
  }
  p.party = null;
  for (const mid of members) {
    const m = game.players.get(mid);
    if (m) m.party = leader && leader.party ? leader.party : null;
  }
  return { ok: true, msg: 'You leave the party.' };
}

export function partyStatus(game, p) {
  if (!p.party) return { ok: false, msg: 'You are not in a party. "party <playername>" to invite, "party join" to accept.' };
  const names = p.party.members.map((mid) => {
    const m = game.players.get(mid);
    return m ? m.name : '?';
  });
  return { ok: true, msg: `\nParty (${names.length}/5): ${names.join(', ')}. Kill credit and quest progress are shared in the same room.` };
}

// ---------- Auction house (player trading) ----------
export function auctionList(game, p) {
  if (p.room !== 'auction_house') return { ok: false, msg: `The auction board hangs in the Merchants' Auction Hall, north of the Grain Pit.` };
  game.auctionPrune();
  if (!game.auctions.length) return { ok: true, msg: `The auction board is bare. Post a lot with "auction offer <item> [qty] for <price>" (at the hall).` };
  const lines = game.auctions.map((a) => `  #${a.id}  ${a.itemName}${a.qty > 1 ? ` x${a.qty}` : ''} — ${a.price} silvers (by ${a.sellerName})`);
  return { ok: true, msg: `\nThe auction board reads:\n${lines.join('\n')}\n\nSay "auction buy <#>". Listings lapse after an hour.` };
}

export function auctionOffer(game, p, itemName, qty, price) {
  if (p.room !== 'auction_house') return { ok: false, msg: `Lots are posted at the Merchants' Auction Hall, north of the Grain Pit.` };
  const entry = p.inventory.find((e) => e.item.id === itemName || e.item.name.includes(itemName));
  if (!entry) return { ok: false, msg: 'You do not have that to offer.' };
  qty = Math.max(1, Math.min(
    p.inventory.filter((e) => e.item.id === entry.item.id).reduce((sum, e) => sum + e.qty, 0),
    Math.floor(qty) || 1,
  ));
  if (!(price > 0)) return { ok: false, msg: 'Set a price in silvers: "auction offer <item> [qty] for <price>".' };
  const instances = removeItemInstances(p, entry.item.id, qty, entry);
  const id = game.auctions.length ? Math.max(...game.auctions.map((a) => a.id)) + 1 : 1;
  game.auctions.push({
    id, seller: p.charId, sellerName: p.name, itemId: entry.item.id,
    itemName: entry.item.name, qty, price, instances, at: Date.now(),
  });
  gainSkillExp(p, 'trading', 6);
  return { ok: true, msg: `You chalk your lot on the board: ${entry.item.name}${qty > 1 ? ` x${qty}` : ''} at ${price} silvers. (listing #${id})` };
}

export function auctionBuy(game, p, listingId) {
  if (p.room !== 'auction_house') return { ok: false, msg: `The auction board hangs in the Merchants' Auction Hall.` };
  game.auctionPrune();
  const lot = game.auctions.find((a) => a.id === listingId);
  if (!lot) return { ok: false, msg: 'No such lot is still on the board.' };
  if (lot.seller === p.charId) return { ok: false, msg: 'You cannot buy your own lot.' };
  if (p.silver < lot.price) return { ok: false, msg: `That lot costs ${lot.price} silvers; you have ${p.silver}.` };
  p.silver -= lot.price;
  game.auctions = game.auctions.filter((a) => a !== lot);
  addItem(p, lot.itemId, lot.qty, lot.instances || null);
  const seller = game.players.get(lot.seller);
  if (seller && seller.online) {
    seller.silver += lot.price;
    if (seller.ws) seller.ws.send(JSON.stringify({ t: 'msg', msg: `Your lot sold at auction: ${lot.itemName}${lot.qty > 1 ? ` x${lot.qty}` : ''} for ${lot.price} silvers.` }));
  } else {
    // Offline sellers are paid into the bank.
    db.prepare('UPDATE characters SET bank = bank + ? WHERE id = ?').run(lot.price, lot.seller);
  }
  gainSkillExp(p, 'trading', 8);
  return { ok: true, msg: `You buy ${lot.itemName}${lot.qty > 1 ? ` x${lot.qty}` : ''} for ${lot.price} silvers.` };
}
