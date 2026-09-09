// Stop world activity and flush players before closing persistence. A failed
// save must produce a failed shutdown, while still attempting the other saves.
import { authWorkStats } from './auth.js';

export async function shutdownWorld({ game, server, wss, closeDb, timeoutMs = 3000 }) {
  const errors = [];
  game.shuttingDown = true;
  const httpClosed = new Promise((resolve) => server.close(resolve));
  game.stop();
  for (const player of [...game.players.values()]) {
    try { game.removePlayer(player); } catch (error) { errors.push(error); }
  }
  const socketsClosed = new Promise((resolve) => wss.close(resolve));
  for (const socket of wss.clients) socket.close(1001, 'World shutting down');
  const timeout = setTimeout(() => {
    for (const socket of wss.clients) socket.terminate();
    server.closeAllConnections();
  }, timeoutMs);
  try {
    await Promise.all([httpClosed, socketsClosed]);
  } finally {
    clearTimeout(timeout);
    // Socket close does not cancel native password work. Let pending auth
    // completions settle before closing their SQLite connection.
    const deadline = Date.now() + timeoutMs;
    while (authWorkStats().active || authWorkStats().queued) {
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (authWorkStats().active || authWorkStats().queued) {
      errors.push(new Error('Authentication work did not drain before shutdown.'));
    } else {
      try { closeDb(); } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'World shutdown could not save all state.');
}
