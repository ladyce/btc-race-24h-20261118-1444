# Swing-low cbBTC bot — btc-race-24h-20261118-1444

Long-only swing bot for the make.fun BTC race. It trades multi-hour
swing lows on 1-minute cbBTC/USDC bars and stays flat the rest of the
time.

## Strategy

1-minute cbBTC returns are near white noise and a full round trip costs
~26 bps, so fast signals bleed out on fees. The bot waits for a real
swing: over the prior 120 bars the high–low range must be at least
100 bps wide (a genuine decline) and the close must have bounced at
least 30 bps above that window's low. It then buys with all cash.

It exits on the first of: the close falling 100 bps below the highest
close since entry (trailing stop), or 360 bars passing since entry.
After any sell it waits 120 bars before a new entry, so it cannot
re-buy the same bounce it just exited. Max slippage 100 bps per order.

## Selection

Tuned only on dev bars 0..959 with a local simulator replicating the
harness fill model; hold-out bars 960..1439 were untouched during
selection. Tune +$12.82 (3 trades), hold-out $0.00 (0 trades — flat
through the late down-grind), full dev window +$15.01 in simulation.
Verified with the kit's exact grader (`grade-local --driver process`).

## Run

The grader runs `node /bot/main.ts`. Standard library only, plus the
vendored SDK shim in `vendor/` (byte-identical copy of the kit shim).
No network, no clock, no randomness — two runs produce identical
orders.
