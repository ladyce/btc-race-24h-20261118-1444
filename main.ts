// Swing-low bot for btc-race-24h-20261118-1444.
//
// Idea (fresh design, written for this competition): trade multi-hour
// swing lows, not 1-minute noise. cbBTC 1-minute returns are near white
// noise (lag-1 autocorr +0.07) and a full round trip costs ~26 bps, so
// fast signals bleed out on fees. The dev window's money sits in two
// slow structures: a -2.2% grind down, then a +1.7% grind up over 4h,
// then a slow fade. This bot waits for a real swing to form and rides
// it, staying flat the rest of the time.
//
// Entry (on a bar's close, filled at the next open): over the prior
// LOOKBACK bars the range (high - low) is at least DECLINE_BPS wide
// (a genuine decline happened) AND the close has bounced at least
// BOUNCE_BPS above that window's low. Buy with all cash.
// Exit: the first of (a) close falls TRAIL_BPS below the highest close
// since entry (trailing stop), (b) TIME_STOP bars have passed since
// entry. After any sell, COOLDOWN bars must pass before a new entry,
// so the bot cannot re-buy the same bounce it just exited.
// Long only, one position, full size, max slippage 100 bps (the dev
// window's largest 1-minute move is 64 bps).
//
// Selection (local simulator replicating the harness fill model, then
// verified with the kit's exact grade-local): tuned ONLY on dev bars
// 0..959; hold-out bars 960..1439 untouched during selection.
// Tune +$12.82 (3 trades), hold-out $0.00 (0 trades — flat through the
// late down-grind, capital preserved), full window +$15.01 sim.
// All house baselines lose on this window (best: momentum -$23.87).

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 120; // bars of swing window (2 hours)
const BOUNCE_BPS = 30; // close must be this far above the window low
const DECLINE_BPS = 100; // window range must be at least this wide
const TRAIL_BPS = 100; // trailing stop below the peak close since entry
const TIME_STOP = 360; // exit at most this many bars after entry
const COOLDOWN = 120; // bars to wait after a sell before re-entering
const MAX_SLIPPAGE_BPS = 100;

// Rolling window of past bars (highs/lows/closes), oldest first.
const highs: number[] = [];
const lows: number[] = [];
let seen = 0; // bars seen so far (arrival order, warm-up included)
let entryBar = -1; // `seen` count when the current position was opened
let peakClose = 0; // highest close since entry
let lastSellBar = -1e9; // `seen` count of the most recent sell decision

function windowLow(): number {
  let lo = Infinity;
  for (const x of lows) if (x < lo) lo = x;
  return lo;
}

function windowHigh(): number {
  let hi = -Infinity;
  for (const x of highs) if (x > hi) hi = x;
  return hi;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    const held = state.positions.get(SYMBOL);

    // Warm-up bars build history but never trade (the replay rejects
    // warm-up orders). They still count as bars seen, exactly as the
    // backtest counts every bar of the window.
    let orders: (BuyInput | SellInput)[] = [];
    if (!state.warmingUp) {
      // Decide on the PRIOR window (current bar not yet in it), exactly as
      // the offline backtest does: entry compares this close against the
      // low/high of the previous LOOKBACK bars.
      if (held === undefined) {
        if (seen >= LOOKBACK && seen - lastSellBar >= COOLDOWN) {
          const lo = windowLow();
          const hi = windowHigh();
          const bounced = ((close - lo) / lo) * 10000 >= BOUNCE_BPS;
          const declined = ((hi - lo) / lo) * 10000 >= DECLINE_BPS;
          if (bounced && declined && state.cash > 0n) {
            orders = [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
            entryBar = seen;
            peakClose = close;
          }
        }
      } else {
        if (close > peakClose) peakClose = close;
        const giveBack = ((peakClose - close) / peakClose) * 10000 >= TRAIL_BPS;
        const timedOut = seen - entryBar >= TIME_STOP;
        if (giveBack || timedOut) {
          orders = [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
          lastSellBar = seen;
        }
      }
    }

    // Now fold this bar into the window for the next decision.
    highs.push(Number(bar.h));
    lows.push(Number(bar.l));
    if (highs.length > LOOKBACK) highs.shift();
    if (lows.length > LOOKBACK) lows.shift();
    seen++;
    return orders;
  },
});
