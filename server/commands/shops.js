// Shop and service commands: market, bank, healer.
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

  heal(ctx) {
    const { game, p, emit } = ctx;
    const res = game.heal(p);
    emit(res.msg);
  },
};
