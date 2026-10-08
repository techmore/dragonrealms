// Route only to stations that the order claim policy actually accepts.
import { ROOMS } from '../data/world.js';
import { walkingRoute, formatRoute } from './route.js';
import { workOrderSnapshot } from './work-order.js';

export function formatOrderRoute(p, steps = '', rooms = ROOMS, snapshot = workOrderSnapshot(p)) {
  if (steps && !/^(?:[1-9]|1\d|20)$/.test(steps)) return 'Usage: route order [steps] — steps must be a whole number from 1 to 20.';
  if (!snapshot) return 'You carry no work order. Use "orders" to review work, or "order" at a craft station to request an assignment.';
  const stations = (snapshot.eligibleStations || []).filter(station => rooms[station.roomId]);
  if (!stations.length) return 'No eligible station is known for this work order. Review "orders" before attempting to craft or claim it.';
  const candidates = stations.map(station => ({ roomId: station.roomId, path: walkingRoute(p.room, station.roomId, rooms) }))
    .filter(station => station.path !== null).sort((a, b) => a.path.length - b.path.length || a.roomId.localeCompare(b.roomId));
  if (!candidates.length) return 'No ordinary walking route reaches an eligible work-order station. Special travel may be needed; "orders" lists the station IDs.';
  return `Work-order station${snapshot.done ? ' — filled work awaits your explicit claim' : ''}:\n${formatRoute(p.room, `${candidates[0].roomId}${steps ? ` ${steps}` : ''}`, rooms)}`;
}
