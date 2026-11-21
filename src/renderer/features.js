/**
 * UI metadata for every chaos feature. Order = display order.
 * `advanced: true` features are collapsed under "Advanced (danger zone)".
 */
export const FEATURES = [
  {
    key: 'addSecond',
    icon: '⏱️',
    title: '+1 Second',
    desc: '5% per tick. A whole extra second. Petty.',
    chance: true,
  },
  {
    key: 'addMinute',
    icon: '😈',
    title: '+1 Minute',
    desc: '1% per tick. Emotionally devastating.',
    chance: true,
  },
  {
    key: 'doubleTime',
    icon: '✖️',
    title: 'Double Time',
    desc: '1% per tick. Doubles whatever is left.',
    chance: true,
  },
  {
    key: 'freeze',
    icon: '❄️',
    title: 'Freeze Timer',
    desc: '5% per tick. Pauses the countdown for 5 cycles.',
    chance: true,
  },
  {
    key: 'formatChaos',
    icon: '🔀',
    title: 'Formatting Chaos',
    desc: '5% per tick. Swaps min/sec or rounds to the nearest minute.',
    chance: true,
  },
  {
    key: 'speedDistortion',
    icon: '🌀',
    title: 'Speed Distortion',
    desc: '10% per tick. A second becomes 2× or 0.5× as long.',
    chance: true,
  },
  {
    key: 'beePuns',
    icon: '💬',
    title: 'BEE Pun Notifications',
    desc: '1% per tick. Desktop notification with a bee pun.',
    chance: true,
  },
  {
    key: 'restMode',
    icon: '🧘',
    title: 'Rest Mode',
    desc: '0.5% per tick. A 3-minute skippable break. Pure mercy.',
    chance: true,
  },
  {
    key: 'originalBeeMode',
    icon: '🐝',
    title: 'Original BEE Mode',
    desc: '1% per tick. Plays a literal BEE sound. Unhinged.',
    chance: true,
    spicy: true,
  },
  {
    key: 'windowChaos',
    icon: '🪟',
    title: 'Window Teleport',
    desc: '1% per tick. Randomly moves the window. Off by default.',
    chance: true,
    advanced: true,
  },
];

export const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
