import test from 'node:test';
import assert from 'node:assert/strict';
import { BeeEngine, mulberry32, formatRemaining } from '../src/renderer/engine.js';

/** Base config: every effect off, then override per test. */
function makeConfig({ durationMs = 60_000, maxRemainingMs = 86_400_000, features = {} } = {}) {
  const off = (extra = {}) => ({ enabled: false, chancePct: 0, ...extra });
  return {
    durationMs,
    maxRemainingMs,
    features: {
      addSecond: off(),
      addMinute: off(),
      doubleTime: off(),
      halveTime: off(),
      freeze: off({ cycles: 5 }),
      formatChaos: off({ swapMinSec: true, roundNearestMinute: true, durationTicks: 3 }),
      speedDistortion: off({ multipliers: [0.5, 2], durationTicks: 4 }),
      distortingChaos: off(),
      windowChaos: off({ marginPx: 40 }),
      originalBeeMode: off({ durationMs: 4000 }),
      beePuns: off(),
      restMode: off({ restMs: 180_000, cooldownMs: 300_000 }),
      swarmRare: off(),
      swarmCommon: off(),
      ...features,
    },
  };
}

/** RNG that returns `values` in order, then a fixed miss value. */
function sequence(values, fallback = 0.999) {
  let i = 0;
  return () => (i < values.length ? values[i++] : fallback);
}

function harness(config, { rng = () => 0.999 } = {}) {
  const timers = [];
  let nowMs = 0;
  const snapshot = {};
  const effects = [];
  const engine = new BeeEngine({
    config,
    rng,
    now: () => nowMs,
    schedule: (fn, delay) => {
      const timer = { fn, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      if (timer) timer.cancelled = true;
    },
    onChange: (s) => {
      Object.assign(snapshot, s);
    },
    onEffect: (e) => effects.push(e),
  });

  function step(times = 1) {
    for (let i = 0; i < times; i += 1) {
      const timer = timers.find((t) => !t.cancelled);
      if (!timer) throw new Error('no scheduled tick available');
      timer.cancelled = true;
      nowMs += timer.delay;
      timer.fn();
    }
  }

  return {
    engine,
    step,
    timers,
    effects,
    now: () => nowMs,
    snap: snapshot,
    liveTimers: () => timers.filter((t) => !t.cancelled),
  };
}

test('formatRemaining: normal, swap, and round modes', () => {
  assert.equal(formatRemaining(600_000), '10:00');
  assert.equal(formatRemaining(59_000), '00:59');
  assert.equal(formatRemaining(3_723_000), '1:02:03');
  assert.equal(formatRemaining(600_000, 'swap'), '00:10');
  assert.equal(formatRemaining(59_000, 'swap'), '59:00');
  assert.equal(formatRemaining(544_000, 'round'), '09:00');

  assert.equal(formatRemaining(586_000, 'round'), '10:00');
});

test('counts down one second per tick', () => {
  const { engine, step, snap } = harness(makeConfig());
  engine.start();
  step(3);
  assert.equal(snap.remainingMs, 57_000);
  assert.equal(snap.display, '00:57');
  assert.equal(snap.stats.ticks, 3);
});

test('pause stops ticks, resume continues', () => {
  const { engine, step, snap, liveTimers } = harness(makeConfig());
  engine.start();
  step(2);
  engine.pause();
  assert.equal(liveTimers().length, 0);
  assert.equal(snap.paused, true);
  engine.resume();
  step(1);
  assert.equal(snap.remainingMs, 57_000);
});

test('+1 second effect fires at 100% and nets zero loss', () => {
  const config = makeConfig({ features: { addSecond: { enabled: true, chancePct: 100 } } });
  const { engine, step, snap } = harness(config);
  engine.start();
  step(1);
  assert.equal(snap.remainingMs, 60_000);
  assert.equal(snap.stats.secondsAdded, 1);
});

test('+1 minute then double respects the max remaining cap', () => {
  const config = makeConfig({
    durationMs: 10_000,
    maxRemainingMs: 120_000,
    features: {
      addMinute: { enabled: true, chancePct: 100 },
      doubleTime: { enabled: true, chancePct: 100 },
    },
  });
  const { engine, step, snap } = harness(config);
  engine.start();
  step(1);
  assert.equal(snap.remainingMs, 120_000);
  assert.equal(snap.stats.doubles, 1);
});

test('freeze pauses the countdown for the configured cycles', () => {
  const config = makeConfig({
    durationMs: 10_000,
    features: { freeze: { enabled: true, chancePct: 5, cycles: 3 } },
  });
  const { engine, step, snap } = harness(config, { rng: sequence([0]) });
  engine.start();
  step(1);
  assert.equal(snap.remainingMs, 9000);
  assert.equal(snap.frozenTicks, 3);
  step(2);
  assert.equal(snap.remainingMs, 9000);
  assert.equal(snap.frozenTicks, 1);
  step(2);
  assert.equal(snap.remainingMs, 8000);
  assert.equal(snap.frozenTicks, 0);
});

test('formatting chaos swaps the actual minute and second values', () => {
  const config = makeConfig({
    durationMs: 836_000, // 13:56
    features: {
      formatChaos: {
        enabled: true,
        chancePct: 5,
        swapMinSec: true,
        roundNearestMinute: false,
        durationTicks: 3,
      },
    },
  });
  const { engine, step, snap } = harness(config, { rng: sequence([0]) });
  engine.start();
  step(1); // 13:55 remaining -> swapped to 55:13
  assert.equal(snap.display, '55:13');
  assert.equal(snap.formatKind, null); // it is a real time change, not a display mask
  step(1); // normal countdown continues from the swapped clock
  assert.equal(snap.display, '55:12');
});

test('rounding chaos snaps the real time and keeps counting down', () => {
  const config = makeConfig({
    durationMs: 620_000, // 10:20
    features: {
      formatChaos: {
        enabled: true,
        chancePct: 5,
        swapMinSec: false,
        roundNearestMinute: true,
        durationTicks: 3,
      },
    },
  });
  const { engine, step, snap } = harness(config, { rng: sequence([0]) });
  engine.start();
  step(1); // 10:19 -> rounded to 10:00
  assert.equal(snap.remainingMs, 600_000);
  assert.equal(snap.display, '10:00');
  step(1); // keeps counting normally
  assert.equal(snap.remainingMs, 599_000);
  assert.equal(snap.display, '09:59');
});

test('speed distortion scales real tick length and expires', () => {
  const config = makeConfig({
    features: { speedDistortion: { enabled: true, chancePct: 10, multipliers: [0.5], durationTicks: 2 } },
  });
  const { engine, step, liveTimers, snap } = harness(config, { rng: sequence([0]) });
  engine.start();
  step(1);
  assert.equal(liveTimers()[0].delay, 500);
  step(1);
  assert.equal(liveTimers()[0].delay, 500);
  step(1);
  assert.equal(snap.speedMult, 1);
  assert.equal(liveTimers()[0].delay, 1000);
});

test('rest mode pauses countdown, can be skipped, and has a cooldown', () => {
  const config = makeConfig({
    durationMs: 10_000,
    features: { restMode: { enabled: true, chancePct: 100, restMs: 3000, cooldownMs: 5000 } },
  });
  const { engine, step, snap, effects } = harness(config);
  engine.start();
  step(1);
  assert.equal(snap.remainingMs, 9000);
  assert.ok(snap.rest);
  assert.equal(snap.rest.display, '00:03');
  step(1);
  assert.equal(snap.remainingMs, 9000);
  assert.equal(snap.rest.remainingMs, 2000);

  engine.skipRest();
  assert.equal(snap.rest, null);
  // cooldown active: 100% chance still cannot restart rest immediately
  step(1);
  assert.equal(snap.rest, null);
  assert.equal(snap.remainingMs, 8000);
  assert.ok(effects.some((e) => e.type === 'rest-end' && e.skipped === true));
});

test('rest mode counts down on its own and ends', () => {
  const config = makeConfig({
    features: { restMode: { enabled: true, chancePct: 100, restMs: 2000, cooldownMs: 0 } },
  });
  const { engine, step, snap } = harness(config);
  engine.start();
  step(1);
  assert.ok(snap.rest);
  step(2);
  assert.equal(snap.rest, null);
});

test('window chaos emits a move effect', () => {
  const config = makeConfig({ features: { windowChaos: { enabled: true, chancePct: 100, marginPx: 40 } } });
  const { engine, step, effects } = harness(config);
  engine.start();
  step(1);
  assert.ok(effects.some((e) => e.type === 'window'));
});

test('bee puns and original bee mode emit their effects', () => {
  const config = makeConfig({
    features: {
      beePuns: { enabled: true, chancePct: 100 },
      originalBeeMode: { enabled: true, chancePct: 100, durationMs: 4000 },
    },
  });
  const { engine, step, effects, snap } = harness(config);
  engine.start();
  step(1);
  assert.ok(effects.some((e) => e.type === 'pun' && typeof e.pun === 'string'));
  assert.ok(effects.some((e) => e.type === 'bees'));
  assert.equal(snap.stats.puns, 1);
  assert.equal(snap.stats.beeModes, 1);
});

test('timer ends at zero and stops scheduling', () => {
  const { engine, step, snap, effects, liveTimers } = harness(makeConfig({ durationMs: 2000 }));
  engine.start();
  step(2);
  assert.equal(snap.ended, true);
  assert.equal(snap.remainingMs, 0);
  assert.equal(snap.running, false);
  assert.equal(liveTimers().length, 0);
  assert.ok(effects.some((e) => e.type === 'end'));
});

test('+1 minute fires ~1% of ticks with a seeded RNG', () => {
  const ticks = 10_000;
  const config = makeConfig({
    durationMs: 86_400_000,
    features: { addMinute: { enabled: true, chancePct: 1 } },
  });
  const { engine, step, snap } = harness(config, { rng: mulberry32(42) });
  engine.start();
  step(ticks);
  const hits = snap.stats.minutesAdded;
  const rate = hits / ticks;
  assert.ok(rate > 0.007 && rate < 0.013, `expected ~1%, got ${(rate * 100).toFixed(2)}% (${hits} hits)`);
});


test('halve time cuts the remaining time in half', () => {
  const config = makeConfig({ features: { halveTime: { enabled: true, chancePct: 100 } } });
  const { engine, step, snap } = harness(config);
  engine.start();
  step(1); // 60000 - 1000 = 59000, then halved
  assert.equal(snap.remainingMs, 29_500);
  assert.equal(snap.stats.halved, 1);
});

test('distorting chaos makes speed permanent and compounding', () => {
  const config = makeConfig({
    features: {
      speedDistortion: { enabled: true, chancePct: 100, multipliers: [2], durationTicks: 4 },
      distortingChaos: { enabled: true, chancePct: 100 },
    },
  });
  const { engine, step, snap, liveTimers } = harness(config, { rng: () => 0 });
  engine.start();
  step(1);
  assert.equal(snap.speedMult, 2);
  assert.equal(snap.speedPermanent, true);
  step(1);
  assert.equal(snap.speedMult, 4); // compounds 2x -> 4x
  assert.equal(liveTimers()[0].delay, 4000);
});

test('distorting chaos does nothing when speed distortion is disabled', () => {
  const config = makeConfig({
    features: {
      speedDistortion: { enabled: false, chancePct: 100, multipliers: [2], durationTicks: 4 },
      distortingChaos: { enabled: true, chancePct: 100 },
    },
  });
  const { engine, step, snap } = harness(config, { rng: () => 0 });
  engine.start();
  step(3);
  assert.equal(snap.speedMult, 1);
  assert.equal(snap.speedPermanent, false);
});


test('blessed swarm halves time once and clears curses', () => {
  const config = makeConfig({ features: { swarmCommon: { enabled: true, chancePct: 100 } } });
  const { engine, step, snap, effects } = harness(config, { rng: () => 0 });
  engine.start();
  step(1); // 59000, then blessed swarm (kind rng 0 -> blessed) halving once
  assert.equal(snap.remainingMs, 29_500);
  assert.equal(snap.stats.swarms, 1);
  assert.ok(effects.some((e) => e.type === 'swarm' && e.kind === 'blessed' && e.units === 1));
});

test('demonic swarm applies one of every bad effect', () => {
  const config = makeConfig({ features: { swarmCommon: { enabled: true, chancePct: 100 } } });
  // first roll hits, second roll (kind) is >= 0.5 -> demonic
  const values = [0, 0.9];
  let call = 0;
  const rng = () => (call < values.length ? values[call++] : 0.9);
  const { engine, step, snap, effects } = harness(config, { rng });
  engine.start();
  step(1);
  assert.equal(snap.stats.swarms, 1);
  assert.equal(snap.stats.demonicSwarms, 1);
  assert.ok(snap.remainingMs > 100_000); // +1s, +1m, double
  assert.ok(snap.frozenTicks > 0);
  assert.ok(effects.some((e) => e.type === 'swarm' && e.kind === 'demonic'));
});

test('rare swarm uses 5 units and is flagged rare', () => {
  const config = makeConfig({ features: { swarmRare: { enabled: true, chancePct: 100 } } });
  const { engine, step, effects } = harness(config, { rng: () => 0 });
  engine.start();
  step(1);
  assert.ok(effects.some((e) => e.type === 'swarm' && e.rare === true && e.units === 5));
});


test('starting after reset logs the luck message', () => {
  const { engine, step } = harness(makeConfig());
  engine.start('reset');
  step(1);
  assert.ok(engine.snapshot().log.some((entry) => entry.text.includes("try your luck")));
});
