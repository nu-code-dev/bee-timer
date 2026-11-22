/**
 * BEE Timer chaos engine.
 *
 * Pure ESM, zero Electron imports. Time is driven by an injected `schedule`
 * function and randomness by an injected `rng`, which makes every chaotic
 * effect reproducible in tests (seeded RNG + fake scheduler).
 *
 * Rules of the game:
 *  - one tick = one game second, but the *real* tick length is scaled by the
 *    speed distortion multiplier (0.5x => 2s real, 2x => 0.5s real)
 *  - formatting chaos is display-only and never mutates the true remaining time
 *  - freeze pauses the countdown for N ticks while the pulse keeps animating
 *  - rest mode pauses the countdown for a real 3 minutes, skippable
 */

import { PUNS } from './puns.js';

export const TICK_BASE_MS = 1000;
export const DEFAULT_MAX_REMAINING_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

/** Deterministic PRNG for tests / replay. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Render remaining time with optional display-only chaos.
 * @param {number} ms
 * @param {null | 'swap' | 'round'} formatKind
 */
export function formatRemaining(ms, formatKind = null) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (formatKind === 'round') {
    const totalMinutes = Math.round(totalSeconds / 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return hh > 0 ? `${hh}:${pad(mm)}:00` : `${pad(mm)}:00`;
  }
  if (formatKind === 'swap') {
    // With hours on the clock, swap the two most significant units (h <-> m).
    return h > 0 ? `${pad(m)}:${pad(h)}:${pad(s)}` : `${pad(s)}:${pad(m)}`;
  }
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** mm:ss clock for the rest overlay. */
export function formatRest(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const EMPTY_STATS = () => ({
  ticks: 0,
  secondsAdded: 0,
  minutesAdded: 0,
  doubles: 0,
  halved: 0,
  freezes: 0,
  formats: 0,
  speeds: 0,
  distortions: 0,
  windowTeleports: 0,
  beeModes: 0,
  puns: 0,
  rests: 0,
  swarms: 0,
  blessedSwarms: 0,
  demonicSwarms: 0,
});

export function formatMult(mult) {
  return Number.isInteger(mult) ? `${mult}\u00d7` : `${mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}\u00d7`;
}

export class BeeEngine {
  /**
   * @param {object} opts
   * @param {object} opts.config sanitized config object
   * @param {() => number} [opts.rng]
   * @param {(fn: Function, delay: number) => any} [opts.schedule]
   * @param {(handle: any) => void} [opts.cancel]
   * @param {() => number} [opts.now]
   * @param {(snapshot: object) => void} [opts.onChange]
   * @param {(effect: object) => void} [opts.onEffect]
   */
  constructor({
    config,
    rng = Math.random,
    schedule = (fn, delay) => setTimeout(fn, delay),
    cancel = (handle) => clearTimeout(handle),
    now = () => Date.now(),
    onChange = () => {},
    onEffect = () => {},
  }) {
    this.config = config;
    this.rng = rng;
    this.schedule = schedule;
    this.cancel = cancel;
    this.now = now;
    this.onChange = onChange;
    this.onEffect = onEffect;

    this.timerHandle = null;
    this.log = [];
    this.logSeq = 0;
    this.punBag = [];
    this.tickStartedAt = now();
    this.reset();
  }

  // --- lifecycle -------------------------------------------------------------

  reset() {
    this.cancelTimer();
    this.remainingMs = this.config.durationMs;
    this.maxRemainingMs = Math.max(
      this.config.maxRemainingMs || DEFAULT_MAX_REMAINING_MS,
      this.config.durationMs,
    );
    this.tick = 0;
    this.running = false;
    this.paused = false;
    this.ended = false;
    this.freezeTicks = 0;
    this.speedState = { mult: 1, untilTick: 0 };
    this.formatState = { kind: null, untilTick: 0 };
    this.rest = null;
    this.cooldownRemainingMs = 0;
    this.stats = EMPTY_STATS();
    this.log = [];
    this.punBag = [];
    this.tickStartedAt = this.now();
    this.emit();
  }

  start(reason = 'fresh') {
    if (this.ended) this.reset();
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.logEvent('🐝', reason === 'reset'
      ? "So you've decided to try your luck."
      : 'Countdown started. Good luck.');
    this.scheduleTick(this.nextTickDelay());
    this.emit();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.cancelTimer();
    this.emit();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.scheduleTick(this.nextTickDelay());
    this.emit();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  destroy() {
    this.cancelTimer();
    this.running = false;
  }

  updateConfig(config) {
    const hadSpeed = this.speedMult !== 1;
    const features = config.features || {};
    this.config = config;
    this.maxRemainingMs = Math.max(
      config.maxRemainingMs || DEFAULT_MAX_REMAINING_MS,
      this.remainingMs,
    );
    const permanentLost = this.speedState.untilTick === Infinity
      && (!features.distortingChaos?.enabled || !features.speedDistortion?.enabled);
    const speedFeatureOff = !features.speedDistortion?.enabled;
    if (hadSpeed && (permanentLost || speedFeatureOff)) {
      this.speedState = { mult: 1, untilTick: 0 };
      this.pushLog('🐝', 'Speed chaos switched off — time is normal again.');
    }
    this.emit();
  }

  skipRest() {
    if (!this.rest) return;
    this.finishRest(true);
    this.emit();
  }

  // --- tick loop -------------------------------------------------------------

  cancelTimer() {
    if (this.timerHandle !== null) {
      this.cancel(this.timerHandle);
      this.timerHandle = null;
    }
  }

  get speedMult() {
    return this.tick < this.speedState.untilTick ? this.speedState.mult : 1;
  }

  get formatKind() {
    return this.tick < this.formatState.untilTick ? this.formatState.kind : null;
  }

  get isFrozen() {
    return this.freezeTicks > 0;
  }

  nextTickDelay() {
    if (this.rest) return TICK_BASE_MS;
    return Math.round(TICK_BASE_MS * this.speedMult);
  }

  scheduleTick(delay = this.nextTickDelay()) {
    this.cancelTimer();
    this.tickStartedAt = this.now();
    this.timerHandle = this.schedule(() => {
      this.timerHandle = null;
      this.onTick();
    }, delay);
  }

  onTick() {
    if (!this.running || this.paused || this.ended) return;
    this.tickStartedAt = this.now();

    // Rest mode: countdown is paused, rest timer counts down in real seconds.
    if (this.rest) {
      this.rest.remainingMs = Math.max(0, this.rest.remainingMs - TICK_BASE_MS);
      if (this.rest.remainingMs === 0) this.finishRest(false);
      this.emit();
      if (this.running && !this.paused) this.scheduleTick(TICK_BASE_MS);
      return;
    }

    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - TICK_BASE_MS);
    }

    if (this.freezeTicks > 0) {
      this.freezeTicks -= 1;
      this.emit();
      if (this.running && !this.paused) this.scheduleTick(this.nextTickDelay());
      return;
    }

    this.tick += 1;
    this.stats.ticks += 1;
    this.remainingMs = Math.max(0, this.remainingMs - TICK_BASE_MS);
    this.applyRandomChaos();

    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.ended = true;
      this.running = false;
      this.pushLog('🎉', 'Time is up. The stream is over. BEE free!');
      this.onEffect({ type: 'end' });
      this.emit();
      return;
    }

    this.emit();
    if (this.running && !this.paused) this.scheduleTick(this.nextTickDelay());
  }

  // --- chaos ----------------------------------------------------------------

  roll(featureKey) {
    const feature = this.config.features?.[featureKey];
    if (!feature || !feature.enabled) return false;
    return this.rng() * 100 < feature.chancePct;
  }

  /** Fixed evaluation order keeps effects deterministic for a given RNG stream. */
  applyRandomChaos() {
    const features = this.config.features || {};

    if (this.roll('addSecond')) {
      this.remainingMs = Math.min(this.remainingMs + 1000, this.maxRemainingMs);
      this.stats.secondsAdded += 1;
      this.pushLog('⏱️', '+1 second. The timer is being petty.');
      this.onEffect({ type: 'add-second' });
    }

    if (this.roll('addMinute')) {
      this.remainingMs = Math.min(this.remainingMs + 60_000, this.maxRemainingMs);
      this.stats.minutesAdded += 1;
      this.pushLog('😈', '+1 minute. Bold of you to think you were close.');
      this.onEffect({ type: 'add-minute' });
    }

    if (this.roll('doubleTime')) {
      const before = this.remainingMs;
      this.remainingMs = Math.min(this.remainingMs * 2, this.maxRemainingMs);
      if (this.remainingMs > before) {
        this.stats.doubles += 1;
        this.pushLog('✖️', 'Remaining time DOUBLED. Why. Just why.');
        this.onEffect({ type: 'double' });
      }
    }

    if (this.roll('halveTime')) {
      const before = this.remainingMs;
      this.remainingMs = Math.max(1000, Math.floor(this.remainingMs / 2));
      if (this.remainingMs < before) {
        this.stats.halved += 1;
        this.pushLog('🎉', 'Remaining time cut in half. Finally, some good news.');
        this.onEffect({ type: 'halve' });
      }
    }

    if (this.roll('freeze')) {
      this.freezeTicks = features.freeze?.cycles ?? 5;
      this.stats.freezes += 1;
      this.pushLog('❄️', `Timer frozen for ${this.freezeTicks} cycles. Enjoy the stillness.`);
      this.onEffect({ type: 'freeze', cycles: this.freezeTicks });
    }

    if (this.roll('formatChaos')) this.triggerFormatChaos();

    const speedFeature = features.speedDistortion;
    const distortFeature = features.distortingChaos;
    const distortingActive = Boolean(speedFeature?.enabled && distortFeature?.enabled);

    if (distortingActive) {
      // Distorting Chaos: rare, permanent and compounding. Speed Distortion's
      // own chance/duration are ignored while this is on.
      if (this.roll('distortingChaos')) {
        const multipliers = speedFeature?.multipliers?.length ? speedFeature.multipliers : [0.5, 2];
        const chosen = multipliers[Math.floor(this.rng() * multipliers.length)] ?? 0.5;
        const current = this.speedMult;
        const next = Math.min(16, Math.max(0.125, Number((current * chosen).toFixed(3))));
        this.speedState = { mult: next, untilTick: Infinity };
        this.stats.speeds += 1;
        this.stats.distortions += 1;
        this.pushLog('♾️', `Distorting chaos: seconds now pass permanently ${formatMult(next)} faster.`);
        this.onEffect({ type: 'speed', mult: next, permanent: true });
      }
    } else if (this.roll('speedDistortion')) {
      const feature = speedFeature;
      const multipliers = feature?.multipliers?.length ? feature.multipliers : [0.5, 2];
      const mult = multipliers[Math.floor(this.rng() * multipliers.length)] ?? 0.5;
      const duration = feature?.durationTicks ?? 4;
      this.speedState = { mult, untilTick: this.tick + duration };
      this.stats.speeds += 1;
      this.pushLog('🌀', `Tick speed: seconds pass ${formatMult(mult)} faster for ${duration} ticks.`);
      this.onEffect({ type: 'speed', mult, durationTicks: duration, permanent: false });
    }

    if (this.roll('windowChaos')) {
      this.stats.windowTeleports += 1;
      this.pushLog('🪟', 'The window got bored and moved.');
      this.onEffect({ type: 'window', marginPx: features.windowChaos?.marginPx ?? 40 });
    }

    if (this.roll('originalBeeMode')) {
      const durationMs = features.originalBeeMode?.durationMs ?? 4000;
      this.stats.beeModes += 1;
      this.pushLog('🐝', 'ORIGINAL BEE MODE. BZZZZZZZZZ.');
      this.onEffect({ type: 'bees', durationMs });
    }

    if (this.roll('beePuns')) {
      const pun = this.drawPun();
      this.stats.puns += 1;
      this.pushLog('💬', pun);
      this.onEffect({ type: 'pun', pun });
    }

    this.rollSwarms();

    if (this.roll('restMode') && !this.rest && this.cooldownRemainingMs === 0) {
      this.startRest();
    }
  }

  rollSwarms() {
    if (this.roll('swarmRare')) {
      const kind = this.rng() < 0.5 ? 'blessed' : 'demonic';
      this.triggerSwarm(kind, 5, true);
      return;
    }
    if (this.roll('swarmCommon')) {
      const kind = this.rng() < 0.5 ? 'blessed' : 'demonic';
      this.triggerSwarm(kind, 1, false);
    }
  }

  /**
   * Blessed/happy swarms apply `units` of every good effect; demonic/angry
   * swarms apply `units` of every bad effect. Rare swarms use units = 5.
   */
  triggerSwarm(kind, units, rare) {
    const speedFeature = this.config.features?.speedDistortion;
    const multipliers = speedFeature?.multipliers?.length ? speedFeature.multipliers : [0.5, 2];

    if (kind === 'blessed') {
      for (let i = 0; i < units; i += 1) {
        this.remainingMs = Math.max(1000, Math.floor(this.remainingMs / 2));
      }
      // Good effects also clear every ongoing curse.
      this.freezeTicks = 0;
      this.formatState = { kind: null, untilTick: 0 };
      this.speedState = { mult: 1, untilTick: 0 };
      this.stats.blessedSwarms += 1;
      this.pushLog(rare ? '🌟' : '🕊️', rare
        ? `RARE BLESSED SWARM! ×${units} blessings of every kind.`
        : 'A happy swarm! A blessing of every kind.');
    } else {
      for (let i = 0; i < units; i += 1) {
        this.remainingMs = Math.min(this.maxRemainingMs, this.remainingMs + 1000);
        this.remainingMs = Math.min(this.maxRemainingMs, this.remainingMs + 60_000);
        this.remainingMs = Math.min(this.maxRemainingMs, this.remainingMs * 2);
        this.freezeTicks += this.config.features?.freeze?.cycles ?? 5;
        this.formatState = {
          kind: this.rng() < 0.5 ? 'swap' : 'round',
          untilTick: this.tick + (this.config.features?.formatChaos?.durationTicks ?? 3),
        };
        const mult = multipliers[Math.floor(this.rng() * multipliers.length)] ?? 0.5;
        this.speedState = {
          mult,
          untilTick: this.tick + (this.config.features?.speedDistortion?.durationTicks ?? 4),
        };
      }
      this.stats.demonicSwarms += 1;
      this.pushLog(rare ? '💀' : '😠', rare
        ? `RARE DEMONIC SWARM! ×${units} curses of every kind.`
        : 'An angry swarm! A curse of every kind.');
    }

    this.stats.swarms += 1;
    this.onEffect({ type: 'swarm', kind, units, rare });
  }

  triggerFormatChaos() {
    const feature = this.config.features?.formatChaos;
    if (!feature) return;
    const options = [];
    if (feature.swapMinSec) options.push('swap');
    if (feature.roundNearestMinute) options.push('round');
    if (!options.length) return;
    const kind = options[Math.floor(this.rng() * options.length)];
    this.stats.formats += 1;

    if (kind === 'swap') {
      // A real swap, not a digit reshuffle: the minute and second *values*
      // change places, so 13:56 becomes 56:13 and then counts down 56:12,
      // 56:11, ... like a normal clock.
      const totalSeconds = Math.max(1, Math.ceil(this.remainingMs / 1000));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const sec = totalSeconds % 60;
      const swappedSeconds = h > 0
        ? m * 3600 + h * 60 + sec // swap hours <-> minutes
        : sec * 60 + m;           // swap minutes <-> seconds
      const cappedSeconds = Math.min(
        swappedSeconds,
        Math.floor(this.maxRemainingMs / 1000),
      );
      const before = this.remainingMs;
      this.remainingMs = Math.max(1000, cappedSeconds * 1000);
      this.formatState = { kind: null, untilTick: 0 };
      this.pushLog('🔀', `Formatting chaos: ${formatRemaining(before, null)} became ${formatRemaining(this.remainingMs, null)}.`);
      this.onEffect({ type: 'format', kind: 'swap', swapped: true });
      return;
    }

    // Rounding is also a real time change: snap the remaining time to the
    // nearest minute, then let the clock keep counting down normally.
    const totalSeconds = Math.max(1, Math.ceil(this.remainingMs / 1000));
    const roundedSeconds = Math.max(60, Math.round(totalSeconds / 60) * 60);
    const before = this.remainingMs;
    this.remainingMs = Math.max(
      1000,
      Math.min(roundedSeconds * 1000, this.maxRemainingMs),
    );
    this.formatState = { kind: null, untilTick: 0 };
    this.pushLog('🔀', `Formatting chaos: ${formatRemaining(before, null)} rounded to ${formatRemaining(this.remainingMs, null)}.`);
    this.onEffect({ type: 'format', kind: 'round', rounded: true });
  }

  startRest() {
    const restMs = this.config.features?.restMode?.restMs ?? 180_000;
    this.rest = { remainingMs: restMs, totalMs: restMs };
    this.stats.rests += 1;
    this.pushLog('🧘', 'Rest mode! Three minutes of peace. You can skip it.');
    this.onEffect({ type: 'rest-start', restMs });
  }

  finishRest(skipped) {
    const cooldownMs = this.config.features?.restMode?.cooldownMs ?? 300_000;
    this.rest = null;
    this.cooldownRemainingMs = cooldownMs;
    this.pushLog(skipped ? '⏭️' : '🌤️', skipped ? 'Rest skipped. Back to chaos.' : 'Rest over. Back to chaos.');
    this.onEffect({ type: 'rest-end', skipped });
  }

  drawPun() {
    if (this.punBag.length === 0) {
      this.punBag = [...PUNS];
      for (let i = this.punBag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.punBag[i], this.punBag[j]] = [this.punBag[j], this.punBag[i]];
      }
    }
    return this.punBag.pop();
  }

  // --- presentation ---------------------------------------------------------

  pushLog(icon, text) {
    this.logSeq += 1;
    this.log.push({ id: this.logSeq, icon, text, at: this.now() });
    if (this.log.length > 40) this.log.shift();
  }

  logEvent(icon, text) {
    this.pushLog(icon, text);
    this.emit();
  }

  snapshot() {
    const speedMult = this.speedMult;
    const formatKind = this.formatKind;
    return {
      running: this.running,
      paused: this.paused,
      ended: this.ended,
      remainingMs: this.remainingMs,
      display: formatRemaining(this.remainingMs, formatKind),
      rawDisplay: formatRemaining(this.remainingMs, null),
      formatKind,
      tick: this.tick,
      frozenTicks: this.freezeTicks,
      speedMult,
      speedPermanent: speedMult !== 1 && this.speedState.untilTick === Infinity,
      tickLengthMs: this.rest ? TICK_BASE_MS : Math.round(TICK_BASE_MS * speedMult),
      pulse: { startedAt: this.tickStartedAt, durationMs: this.nextTickDelay() },
      rest: this.rest
        ? {
            remainingMs: this.rest.remainingMs,
            totalMs: this.rest.totalMs,
            display: formatRest(this.rest.remainingMs),
          }
        : null,
      cooldownRemainingMs: this.cooldownRemainingMs,
      stats: { ...this.stats },
      log: this.log.slice(-12).reverse(),
      maxRemainingMs: this.maxRemainingMs,
    };
  }

  emit() {
    this.onChange(this.snapshot());
  }
}
