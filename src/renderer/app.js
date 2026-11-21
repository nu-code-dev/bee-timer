import { BeeEngine } from './engine.js';
import { FEATURES } from './features.js';

const api = window.bee;
const $ = (id) => document.getElementById(id);

const MIN_DURATION_MS = 5_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

let config = null;
let engine = null;
let latest = null;
let screen = 'wizard';
let saveTimer = null;
let toastTimer = null;
let swarmTimer = null;
let rafId = null;
let audioCtx = null;
let draftDurationMs = 10 * 60 * 1000;

const els = {};

function cacheEls() {
  [
    'wizardScreen', 'timerScreen', 'settingsScreen', 'wizardFeatures', 'settingsFeatures',
    'advancedPanel', 'advancedToggle', 'durationInput', 'durationHint', 'startBtn',
    'timeDisplay', 'formatBadge', 'secondLen', 'pulseFill', 'freezeChip', 'restChip',
    'speedChip', 'pauseChip', 'pauseBtn', 'resetBtn', 'settingsBtn', 'logList',
    'restOverlay', 'restCountdown', 'restProgressFill', 'skipRestBtn',
    'endOverlay', 'endStats', 'runBackBtn', 'endSettingsBtn', 'toast', 'toastText',
    'swarm', 'settingsCloseBtn', 'settingsLiveNote', 'midRunToggle', 'onTopToggle',
    'reducedMotionToggle', 'defaultsBtn', 'quitBtn', 'pinBtn', 'minBtn', 'closeBtn',
  ].forEach((id) => { els[id] = $(id); });
}

// --------------------------------------------------------------------------
// boot
// --------------------------------------------------------------------------
(async function init() {
  cacheEls();
  config = await api.config.get();
  draftDurationMs = config.durationMs;

  bindChrome();
  bindWizard();
  bindTimer();
  bindSettings();
  buildFeatureLists();
  applyAppearance();
  syncPinButton();

  if (config.onboarded) {
    showScreen('timer');
    ensureEngine();
  } else {
    showScreen('wizard');
  }

  startPulseLoop();
  window.addEventListener('keydown', onKeyDown);

  // Debug/testing hook (read-only ergonomics for local smoke tests).
  window.__BEE_DEBUG__ = {
    get engine() { return engine; },
    get config() { return config; },
    get snapshot() { return latest; },
    showScreen: (name) => showScreen(name),
  };
})().catch((err) => {
  console.error('[bee-timer] init failed', err);
  document.body.innerHTML = `<pre style="padding:20px;color:#f88">BEE Timer failed to start:\n${err.message}</pre>`;
});

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function applyAppearance() {
  document.body.classList.toggle('reduced-motion', Boolean(config.appearance?.reducedMotion));
}

function syncPinButton() {
  els.pinBtn.classList.toggle('pinned', Boolean(config.window?.alwaysOnTop));
  els.pinBtn.title = config.window?.alwaysOnTop ? 'Always on top: ON' : 'Always on top: OFF';
}

async function persist() {
  try {
    config = await api.config.save(config);
  } catch (err) {
    console.error('[bee-timer] failed to save config', err);
  }
}

function persistDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 220);
}

function notifyConfigChanged() {
  applyAppearance();
  if (engine) engine.updateConfig(config);
  syncFeatureControls();
  persistDebounced();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseDuration(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.includes(':')) {
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part;
    return Math.round(seconds * 1000);
  }
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60 * 1000);
}

function durationLabel(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --------------------------------------------------------------------------
// screens
// --------------------------------------------------------------------------
function showScreen(name) {
  screen = name;
  els.wizardScreen.classList.toggle('hidden', name !== 'wizard');
  els.timerScreen.classList.toggle('hidden', name !== 'timer');
  els.settingsScreen.classList.toggle('hidden', name !== 'settings');
  api.window.setMode(name === 'settings' ? 'settings' : name === 'wizard' ? 'wizard' : 'widget');
  if (name === 'settings') refreshSettingsState();
  if (name === 'timer') render(latest);
}

function onKeyDown(event) {
  if (event.key === 'Escape' && screen === 'settings') {
    showScreen('timer');
    return;
  }
  if (event.code === 'Space' && screen === 'timer' && !event.repeat) {
    event.preventDefault();
    togglePause();
  }
}

// --------------------------------------------------------------------------
// onboarding
// --------------------------------------------------------------------------
function bindWizard() {
  document.querySelectorAll('.chip[data-minutes]').forEach((chip) => {
    chip.addEventListener('click', () => {
      draftDurationMs = Number(chip.dataset.minutes) * 60 * 1000;
      els.durationInput.value = durationLabel(draftDurationMs);
      updateDurationHint();
      markActiveChip(chip);
    });
  });

  els.durationInput.addEventListener('change', () => {
    const parsed = parseDuration(els.durationInput.value);
    if (!parsed || parsed < MIN_DURATION_MS || parsed > MAX_DURATION_MS) {
      els.durationInput.value = durationLabel(draftDurationMs);
      return;
    }
    draftDurationMs = parsed;
    els.durationInput.value = durationLabel(draftDurationMs);
    updateDurationHint();
    markActiveChip(null);
  });

  els.advancedToggle.addEventListener('click', () => {
    const isHidden = els.advancedPanel.classList.toggle('hidden');
    els.advancedToggle.setAttribute('aria-expanded', String(!isHidden));
    els.advancedToggle.innerHTML = isHidden
      ? 'Advanced · danger zone <span>▾</span>'
      : 'Advanced · danger zone <span>▴</span>';
  });

  els.startBtn.addEventListener('click', startRun);
}

function markActiveChip(activeChip) {
  document.querySelectorAll('.chip[data-minutes]').forEach((chip) => {
    chip.classList.toggle('is-active', chip === activeChip);
  });
}

function updateDurationHint() {
  els.durationHint.textContent = `${durationLabel(draftDurationMs)} total`;
}

async function startRun() {
  unlockAudio();
  config.durationMs = draftDurationMs;
  config.onboarded = true;
  await persist();
  ensureEngine(true);
  showScreen('timer');
  engine.start();
}

// --------------------------------------------------------------------------
// feature lists
// --------------------------------------------------------------------------
function buildFeatureRow(feature) {
  const row = document.createElement('div');
  row.className = `feature-row${feature.spicy ? ' spicy' : ''}`;

  const icon = document.createElement('span');
  icon.className = 'feature-icon';
  icon.textContent = feature.icon;
  icon.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('div');
  copy.className = 'feature-copy';
  const title = document.createElement('strong');
  title.textContent = feature.title;
  const desc = document.createElement('small');
  desc.textContent = feature.desc;
  copy.append(title, desc);

  const chance = document.createElement('label');
  chance.className = 'chance-field';
  chance.title = 'Chance per tick (%)';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '100';
  input.step = '0.1';
  input.dataset.chanceForKey = feature.key;
  input.value = String(config.features[feature.key].chancePct);
  input.addEventListener('change', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = String(config.features[feature.key].chancePct);
      return;
    }
    setFeature(feature.key, { chancePct: clamp(value, 0, 100) });
  });
  const pct = document.createElement('span');
  pct.textContent = '%';
  chance.append(input, pct);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'switch';
  toggle.checked = Boolean(config.features[feature.key].enabled);
  toggle.dataset.switchForKey = feature.key;
  toggle.setAttribute('aria-label', feature.title);
  toggle.addEventListener('change', () => setFeature(feature.key, { enabled: toggle.checked }));

  row.append(icon, copy, chance, toggle);
  return row;
}

function buildFeatureLists() {
  els.wizardFeatures.innerHTML = '';
  els.advancedPanel.innerHTML = '';
  els.settingsFeatures.innerHTML = '';

  for (const feature of FEATURES) {
    if (feature.advanced) {
      els.advancedPanel.append(buildFeatureRow(feature));
    } else {
      els.wizardFeatures.append(buildFeatureRow(feature));
    }
    els.settingsFeatures.append(buildFeatureRow(feature));
  }
}

function setFeature(key, patch) {
  config.features[key] = { ...config.features[key], ...patch };
  syncFeatureControls();
  notifyConfigChanged();
}

function syncFeatureControls() {
  document.querySelectorAll('[data-switch-for-key]').forEach((input) => {
    const key = input.dataset.switchForKey;
    input.checked = Boolean(config.features[key]?.enabled);
  });
  document.querySelectorAll('[data-chance-for-key]').forEach((input) => {
    const key = input.dataset.chanceForKey;
    if (document.activeElement !== input) input.value = String(config.features[key]?.chancePct ?? 0);
  });
  refreshSettingsState();
}

// --------------------------------------------------------------------------
// timer
// --------------------------------------------------------------------------
function ensureEngine(startImmediately = false) {
  if (engine) engine.destroy();
  engine = new BeeEngine({
    config,
    onChange: render,
    onEffect: handleEffect,
  });
  latest = engine.snapshot();
  render(latest);
  if (startImmediately) api.window.setMode('widget');
}

function bindTimer() {
  els.pauseBtn.addEventListener('click', () => {
    unlockAudio();
    togglePause();
  });
  els.resetBtn.addEventListener('click', () => {
    if (!engine) ensureEngine();
    engine.reset();
    hideEndScreen();
    engine.start();
  });
  els.settingsBtn.addEventListener('click', () => {
    if (engine && engine.running && !engine.paused && !config.midRunSettings) return;
    showScreen('settings');
  });
  els.skipRestBtn.addEventListener('click', () => engine?.skipRest());
  els.runBackBtn.addEventListener('click', () => {
    hideEndScreen();
    engine?.reset();
    engine?.start();
  });
  els.endSettingsBtn.addEventListener('click', () => showScreen('settings'));
}

function togglePause() {
  if (!engine) return;
  if (engine.ended) {
    hideEndScreen();
    engine.reset();
    engine.start();
    return;
  }
  if (!engine.running) {
    engine.start();
    return;
  }
  engine.togglePause();
}

function render(snapshot) {
  if (!snapshot) return;
  latest = snapshot;

  els.timeDisplay.textContent = snapshot.display;
  els.timeDisplay.classList.toggle('chaos-swap', snapshot.formatKind === 'swap');
  els.timeDisplay.classList.toggle('chaos-round', snapshot.formatKind === 'round');
  els.formatBadge.classList.toggle('hidden', !snapshot.formatKind);
  els.secondLen.textContent = `${(snapshot.tickLengthMs / 1000).toFixed(1)}s`;

  els.freezeChip.classList.toggle('hidden', snapshot.frozenTicks <= 0);
  if (snapshot.frozenTicks > 0) els.freezeChip.textContent = `❄️ frozen ${snapshot.frozenTicks}`;
  els.restChip.classList.toggle('hidden', !snapshot.rest);
  const showSpeed = snapshot.speedMult !== 1;
  els.speedChip.classList.toggle('hidden', !showSpeed);
  if (showSpeed) els.speedChip.textContent = `🌀 ${snapshot.speedMult}×`;
  els.pauseChip.classList.toggle('hidden', !(snapshot.running && snapshot.paused));

  els.pauseBtn.textContent = snapshot.ended
    ? 'Run it back'
    : !snapshot.running
      ? 'Start'
      : snapshot.paused
        ? 'Resume'
        : 'Pause';
  els.pauseBtn.disabled = false;
  const lockSettings = snapshot.running && !snapshot.paused && !config.midRunSettings;
  els.settingsBtn.disabled = lockSettings;
  els.settingsBtn.title = lockSettings ? 'Mid-run settings are disabled for this run' : 'Settings';

  renderLog(snapshot.log);
  renderRest(snapshot.rest);
  if (snapshot.ended) showEndScreen(snapshot);
}

function renderLog(entries) {
  if (!entries || !entries.length) {
    els.logList.innerHTML = '<li><span class="log-icon">🐝</span><span>Waiting for chaos…</span></li>';
    return;
  }
  els.logList.innerHTML = entries
    .slice(0, 4)
    .map((entry) => `<li><span class="log-icon">${entry.icon}</span><span>${escapeHtml(entry.text)}</span></li>`)
    .join('');
}

function renderRest(rest) {
  if (!rest) {
    els.restOverlay.classList.add('hidden');
    return;
  }
  els.restOverlay.classList.remove('hidden');
  els.restCountdown.textContent = rest.display;
  const ratio = rest.totalMs > 0 ? clamp(rest.remainingMs / rest.totalMs, 0, 1) : 0;
  els.restProgressFill.style.width = `${(ratio * 100).toFixed(1)}%`;
}

function showEndScreen(snapshot) {
  els.endOverlay.classList.remove('hidden');
  const stats = snapshot.stats;
  els.endStats.textContent =
    `${stats.ticks} ticks survived · +${stats.secondsAdded}s · +${stats.minutesAdded}m · ` +
    `${stats.doubles} doubles · ${stats.freezes} freezes · ${stats.rests} rests · ${stats.puns} puns`;
  if (!showEndScreen.shown) {
    showEndScreen.shown = true;
    playChime();
    spawnSwarm(2600, 26);
  }
}

function hideEndScreen() {
  els.endOverlay.classList.add('hidden');
  showEndScreen.shown = false;
}

// --------------------------------------------------------------------------
// pulse meter
// --------------------------------------------------------------------------
function startPulseLoop() {
  cancelAnimationFrame(rafId);
  const tick = () => {
    if (latest && els.pulseFill) {
      const span = latest.pulse?.durationMs || 1000;
      let ratio = 0;
      if (latest.running && !latest.paused) {
        ratio = clamp((Date.now() - latest.pulse.startedAt) / span, 0, 1);
      }
      els.pulseFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// --------------------------------------------------------------------------
// chaos side effects
// --------------------------------------------------------------------------
function handleEffect(effect) {
  switch (effect.type) {
    case 'pun':
      showToast(effect.pun);
      api.notify('BEE Timer 🐝', effect.pun).catch(() => {});
      break;
    case 'bees':
      unlockAudio();
      playBuzz(effect.durationMs || 4000);
      spawnSwarm(effect.durationMs || 4000, 18);
      els.timerScreen.classList.add('shake');
      setTimeout(() => els.timerScreen.classList.remove('shake'), 420);
      break;
    case 'window':
      api.window.chaosMove(effect.marginPx || 40).catch(() => {});
      break;
    case 'rest-start':
      unlockAudio();
      playChime(true);
      break;
    default:
      break;
  }
}

function showToast(text) {
  clearTimeout(toastTimer);
  els.toastText.textContent = text;
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 4500);
}

function spawnSwarm(ms, count = 18) {
  clearTimeout(swarmTimer);
  els.swarm.innerHTML = '';
  for (let i = 0; i < count; i += 1) {
    const bee = document.createElement('span');
    bee.textContent = i % 7 === 0 ? '🐝' : i % 3 === 0 ? '🍯' : '🐝';
    bee.style.left = `${Math.random() * 88}%`;
    bee.style.top = `${Math.random() * 82}%`;
    bee.style.animationDuration = `${(1.2 + Math.random() * 1.6).toFixed(2)}s`;
    bee.style.animationDelay = `${(Math.random() * 0.8).toFixed(2)}s`;
    bee.style.fontSize = `${14 + Math.random() * 12}px`;
    els.swarm.append(bee);
  }
  els.swarm.classList.remove('hidden');
  swarmTimer = setTimeout(() => {
    els.swarm.classList.add('hidden');
    els.swarm.innerHTML = '';
  }, ms);
}

// --------------------------------------------------------------------------
// audio (synthesized — no asset licensing, works on PipeWire/ALSA/CoreAudio/WASAPI)
// --------------------------------------------------------------------------
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) {
    console.warn('[bee-timer] audio unavailable', err.message);
  }
}

function playBuzz(durationMs = 3000) {
  const ctx = audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = Math.max(0.3, durationMs / 1000);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 186;

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 7.5;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = 26;
  vibrato.connect(vibratoGain).connect(osc.frequency);

  const tremolo = ctx.createOscillator();
  tremolo.frequency.value = 13;
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 0.045;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.07);
  gain.gain.setValueAtTime(0.16, now + dur - 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  tremolo.connect(tremoloGain).connect(gain.gain);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  vibrato.start(now);
  tremolo.start(now);
  osc.stop(now + dur);
  vibrato.stop(now + dur);
  tremolo.stop(now + dur);
}

function playChime(gentle = false) {
  const ctx = audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = gentle ? [523.25, 659.25] : [523.25, 659.25, 783.99];
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + index * 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gentle ? 0.05 : 0.09, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.95);
  });
}

// --------------------------------------------------------------------------
// settings
// --------------------------------------------------------------------------
function bindSettings() {
  els.settingsCloseBtn.addEventListener('click', () => showScreen('timer'));

  els.midRunToggle.addEventListener('change', () => {
    config.midRunSettings = els.midRunToggle.checked;
    notifyConfigChanged();
  });
  els.onTopToggle.addEventListener('change', () => {
    setAlwaysOnTop(els.onTopToggle.checked);
  });
  els.reducedMotionToggle.addEventListener('change', () => {
    config.appearance.reducedMotion = els.reducedMotionToggle.checked;
    notifyConfigChanged();
  });
  els.defaultsBtn.addEventListener('click', resetDefaults);
  els.quitBtn.addEventListener('click', () => api.app.quit());
}

function refreshSettingsState() {
  if (!els.midRunToggle) return;
  els.midRunToggle.checked = Boolean(config.midRunSettings);
  els.onTopToggle.checked = Boolean(config.window.alwaysOnTop);
  els.reducedMotionToggle.checked = Boolean(config.appearance.reducedMotion);
  const running = Boolean(engine && engine.running && !engine.paused);
  const live = els.settingsLiveNote;
  if (running && !config.midRunSettings) {
    live.textContent = 'Mid-run settings are locked for this run.';
    live.classList.add('locked');
  } else if (running) {
    live.textContent = 'Changes apply immediately, mid-run. Chaos is editable.';
    live.classList.remove('locked');
  } else {
    live.textContent = 'Changes apply immediately.';
    live.classList.remove('locked');
  }
}

async function setAlwaysOnTop(value) {
  const actual = await api.window.setAlwaysOnTop(value);
  config.window.alwaysOnTop = Boolean(actual);
  els.onTopToggle.checked = config.window.alwaysOnTop;
  syncPinButton();
  persist();
}

async function resetDefaults() {
  const defaults = await api.config.defaults();
  config.features = structuredClone(defaults.features);
  config.midRunSettings = defaults.midRunSettings;
  config.appearance = { ...config.appearance, reducedMotion: defaults.appearance.reducedMotion };
  config.window.alwaysOnTop = defaults.window.alwaysOnTop;
  buildFeatureLists();
  syncFeatureControls();
  notifyConfigChanged();
  refreshSettingsState();
}

// --------------------------------------------------------------------------
// chrome buttons
// --------------------------------------------------------------------------
function bindChrome() {
  els.pinBtn.addEventListener('click', () => setAlwaysOnTop(!config.window.alwaysOnTop));
  els.minBtn.addEventListener('click', () => api.app.minimize());
  els.closeBtn.addEventListener('click', () => api.app.quit());
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
