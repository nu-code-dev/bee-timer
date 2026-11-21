// Tiny CDP helper for local smoke-testing the renderer (dev only).
// usage: node scripts/dev-cdp.mjs eval "<js>"
//        node scripts/dev-cdp.mjs shot <out.png>
const [cmd, arg] = process.argv.slice(2);
const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = tabs.find((t) => t.type === 'page') || tabs[0];
if (!page) throw new Error('no CDP page found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve) => { pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
if (cmd === 'shot-size') {
  const [w, h, scale] = [Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5] || 2)];
  const out = process.argv[6] || 'shot.png';
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
  await new Promise((r) => setTimeout(r, 250));
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(res.result.data, 'base64'));
  await send('Emulation.clearDeviceMetricsOverride');
  console.log(`wrote ${out} (${w}x${h} @${scale}x)`);
} else if (cmd === 'eval') {
  const res = await send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(res.result?.result?.value ?? res.result, null, 2));
} else if (cmd === 'shot') {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(arg, Buffer.from(res.result.data, 'base64'));
  console.log(`wrote ${arg}`);
} else {
  console.log('usage: eval <js> | shot <path> | shot-size <w> <h> <scale> <path>');
}
ws.close();
