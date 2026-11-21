'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/**
 * Canonical defaults for BEE Timer.
 * Every feature is individually configurable; all chances are per-tick percentages.
 * windowChaos ("randomly moving around the screen") ships default OFF and is tucked
 * into the Advanced section by design.
 */
const DEFAULTS = Object.freeze({
  schemaVersion: 1,
  onboarded: false,
  durationMs: 10 * 60 * 1000,
  tickBaseMs: 1000,
  maxRemainingMs: 24 * 60 * 60 * 1000,
  midRunSettings: true,
  features: {
    addSecond:      { enabled: true,  chancePct: 5 },
    addMinute:      { enabled: true,  chancePct: 1 },
    doubleTime:     { enabled: true,  chancePct: 1 },
    freeze:         { enabled: true,  chancePct: 5, cycles: 5 },
    formatChaos:    { enabled: true,  chancePct: 5, swapMinSec: true, roundNearestMinute: true, durationTicks: 3 },
    speedDistortion:{ enabled: true,  chancePct: 10, multipliers: [0.5, 2], durationTicks: 4 },
    windowChaos:    { enabled: false, chancePct: 1, marginPx: 40 },
    originalBeeMode:{ enabled: false, chancePct: 1, durationMs: 4000 },
    beePuns:        { enabled: true,  chancePct: 1 },
    restMode:       { enabled: true,  chancePct: 0.5, restMs: 180000, cooldownMs: 300000 },
  },
  appearance: { theme: 'honey', reducedMotion: false, opacity: 0.97 },
  window: { alwaysOnTop: true, x: null, y: null, width: 392, height: 250 },
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

const FEATURE_RULES = {
  addSecond:       (d, i) => ({ enabled: bool(i.enabled, d.enabled), chancePct: num(i.chancePct, 0, 100, d.chancePct) }),
  addMinute:       (d, i) => ({ enabled: bool(i.enabled, d.enabled), chancePct: num(i.chancePct, 0, 100, d.chancePct) }),
  doubleTime:      (d, i) => ({ enabled: bool(i.enabled, d.enabled), chancePct: num(i.chancePct, 0, 100, d.chancePct) }),
  freeze:          (d, i) => ({
    enabled: bool(i.enabled, d.enabled),
    chancePct: num(i.chancePct, 0, 100, d.chancePct),
    cycles: Math.round(num(i.cycles, 1, 60, d.cycles)),
  }),
  formatChaos:     (d, i) => ({
    enabled: bool(i.enabled, d.enabled),
    chancePct: num(i.chancePct, 0, 100, d.chancePct),
    swapMinSec: bool(i.swapMinSec, d.swapMinSec),
    roundNearestMinute: bool(i.roundNearestMinute, d.roundNearestMinute),
    durationTicks: Math.round(num(i.durationTicks, 1, 60, d.durationTicks)),
  }),
  speedDistortion: (d, i) => {
    const allowed = [0.5, 2];
    const multipliers = Array.isArray(i.multipliers)
      ? i.multipliers.map(Number).filter((m) => allowed.includes(m))
      : d.multipliers;
    return {
      enabled: bool(i.enabled, d.enabled),
      chancePct: num(i.chancePct, 0, 100, d.chancePct),
      multipliers: multipliers.length ? [...new Set(multipliers)] : d.multipliers,
      durationTicks: Math.round(num(i.durationTicks, 1, 60, d.durationTicks)),
    };
  },
  windowChaos:     (d, i) => ({
    enabled: bool(i.enabled, d.enabled),
    chancePct: num(i.chancePct, 0, 100, d.chancePct),
    marginPx: Math.round(num(i.marginPx, 0, 400, d.marginPx)),
  }),
  originalBeeMode: (d, i) => ({
    enabled: bool(i.enabled, d.enabled),
    chancePct: num(i.chancePct, 0, 100, d.chancePct),
    durationMs: Math.round(num(i.durationMs, 500, 30000, d.durationMs)),
  }),
  beePuns:         (d, i) => ({ enabled: bool(i.enabled, d.enabled), chancePct: num(i.chancePct, 0, 100, d.chancePct) }),
  restMode:        (d, i) => ({
    enabled: bool(i.enabled, d.enabled),
    chancePct: num(i.chancePct, 0, 100, d.chancePct),
    restMs: Math.round(num(i.restMs, 5000, 3600000, d.restMs)),
    cooldownMs: Math.round(num(i.cooldownMs, 0, 3600000, d.cooldownMs)),
  }),
};

function sanitizeConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const rawFeatures = raw.features && typeof raw.features === 'object' ? raw.features : {};
  const features = {};
  for (const [key, rule] of Object.entries(FEATURE_RULES)) {
    const def = DEFAULTS.features[key];
    const item = rawFeatures[key] && typeof rawFeatures[key] === 'object' ? rawFeatures[key] : {};
    features[key] = rule(def, item);
  }
  const appearance = raw.appearance && typeof raw.appearance === 'object' ? raw.appearance : {};
  const win = raw.window && typeof raw.window === 'object' ? raw.window : {};
  const x = typeof win.x === 'number' && Number.isFinite(win.x) ? Math.round(win.x) : null;
  const y = typeof win.y === 'number' && Number.isFinite(win.y) ? Math.round(win.y) : null;

  return {
    schemaVersion: 1,
    onboarded: bool(raw.onboarded, DEFAULTS.onboarded),
    durationMs: Math.round(num(raw.durationMs, 5000, DEFAULTS.maxRemainingMs, DEFAULTS.durationMs)),
    tickBaseMs: 1000,
    maxRemainingMs: DEFAULTS.maxRemainingMs,
    midRunSettings: bool(raw.midRunSettings, DEFAULTS.midRunSettings),
    features,
    appearance: {
      theme: 'honey',
      reducedMotion: bool(appearance.reducedMotion, DEFAULTS.appearance.reducedMotion),
      opacity: num(appearance.opacity, 0.6, 1, DEFAULTS.appearance.opacity),
    },
    window: {
      alwaysOnTop: bool(win.alwaysOnTop, DEFAULTS.window.alwaysOnTop),
      x,
      y,
      width: Math.round(num(win.width, 360, 900, DEFAULTS.window.width)),
      height: Math.round(num(win.height, 220, 1200, DEFAULTS.window.height)),
    },
  };
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const file = getConfigPath();
    if (!fs.existsSync(file)) return sanitizeConfig(DEFAULTS);
    return sanitizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.error('[bee-timer] failed to load config, using defaults:', err.message);
    return sanitizeConfig(DEFAULTS);
  }
}

function saveConfig(input) {
  const config = sanitizeConfig(input);
  const file = getConfigPath();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return config;
}

module.exports = { DEFAULTS, sanitizeConfig, loadConfig, saveConfig, getConfigPath };
