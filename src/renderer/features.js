/**
 * UI metadata for every chaos feature.
 *
 * Descriptions intentionally do NOT contain percentages: the per-tick chance is
 * editable right next to each toggle, so a hard-coded "5% per tick" would go
 * stale the moment the user changes it.
 *
 * `group: 'advanced'` features live under "Advanced · don't touch" so the
 * disruptive ones are kept away from the regular chaos switches.
 */
export const FEATURES = [
  {
    key: 'addSecond',
    icon: '⏱️',
    title: '+1 Second',
    desc: 'A whole extra second. Petty.',
    group: 'core',
  },
  {
    key: 'addMinute',
    icon: '😈',
    title: '+1 Minute',
    desc: 'A full extra minute. Emotionally devastating.',
    group: 'core',
  },
  {
    key: 'doubleTime',
    icon: '✖️',
    title: 'Double Time',
    desc: 'Doubles whatever time you have left.',
    group: 'core',
  },
  {
    key: 'halveTime',
    icon: '➗',
    title: 'Halve Time',
    desc: 'Cuts your remaining time in half. A gift from the hive.',
    group: 'core',
  },
  {
    key: 'freeze',
    icon: '❄️',
    title: 'Freeze Timer',
    desc: 'Pauses the countdown for a few cycles.',
    group: 'core',
  },
  {
    key: 'formatChaos',
    icon: '🔀',
    title: 'Formatting Chaos',
    desc: 'Swaps the minute/second values for real (13:56 → 56:13) or rounds the remaining time to the nearest minute.',
    group: 'core',
  },
  {
    key: 'speedDistortion',
    icon: '🌀',
    title: 'Speed Distortion',
    desc: 'A second becomes 2× or 0.5× as long, for a while.',
    group: 'core',
    extras: [{ key: 'durationTicks', label: 'ticks', min: 1, max: 60, step: 1 }],
  },
  {
    key: 'beePuns',
    icon: '💬',
    title: 'Supportive BEE Messages',
    desc: 'A kind message from the hive. No puns — just support.',
    group: 'core',
  },
  {
    key: 'restMode',
    icon: '🧘',
    title: 'Rest Mode',
    desc: 'A skippable 3-minute break. Pure mercy.',
    group: 'core',
  },
  {
    key: 'distortingChaos',
    icon: '♾️',
    title: 'Distorting Chaos',
    desc: 'Makes speed distortion permanent and compounding. Requires Speed Distortion.',
    group: 'advanced',
  },
  {
    key: 'originalBeeMode',
    icon: '🐝',
    title: 'Original BEE Mode',
    desc: 'Plays a literal BEE sound. Unhinged.',
    group: 'advanced',
    spicy: true,
  },
  {
    key: 'windowChaos',
    icon: '🪟',
    title: 'Window Teleport',
    desc: 'Randomly moves the window. Off by default.',
    group: 'advanced',
  },
  {
    key: 'swarmRare',
    icon: '🌟',
    title: 'Rare Swarms',
    desc: 'A rare blessed or demonic swarm: ×5 of every good or bad effect. Whole-screen event.',
    chanceStep: 0.05,
    group: 'swarm',
  },
  {
    key: 'swarmCommon',
    icon: '🐝',
    title: 'Common Swarms',
    desc: 'A happy or angry swarm: ×1 of every good or bad effect. Themed popup.',
    chanceStep: 0.05,
    group: 'swarm',
  },
];

export const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
