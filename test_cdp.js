/* Minimal CDP driver: screenshots + interaction tests for the Nobel Atlas page. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.URL || 'file:///D:/testdata1/.venv1/nobel/site/index.html';
const OUT = process.env.OUT || 'D:\\testdata1\\.venv1\\nobel\\shots';
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

class Client {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.session = null;
    this.logs = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        if (type === 'error' || type === 'warning') {
          this.logs.push(type + ': ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.logs.push('EXCEPTION: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
      }
    };
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr, session) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, session);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  }
  async shot(file, session, opts) {
    const r = await this.send('Page.captureScreenshot', Object.assign({ format: 'png', captureBeyondViewport: true }, opts || {}), session);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'));
    console.log('shot', file);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion',
    '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--window-size=1440,1000',
    '--user-data-dir=' + path.join(require('os').tmpdir(), 'nobel-chrome-test'),
    'about:blank'
  ], { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await getJSON('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (e) { await sleep(250); }
  }
  if (!version) { console.error('chrome did not start'); chrome.kill(); process.exit(1); }

  const c = new Client(version.webSocketDebuggerUrl);
  await c.ready;
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });

  await c.send('Page.enable', {}, sessionId);
  await c.send('Runtime.enable', {}, sessionId);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

  const nav = async (url, wait) => {
    await c.send('Page.navigate', { url }, sessionId);
    await sleep(wait || 2200);
  };

  await nav(URL, 2500);

  // sanity checks
  const checks = await c.eval(`(function(){
    return {
      kpis: document.querySelectorAll('#kpis .kpi').length,
      charts: document.querySelectorAll('.chart svg').length,
      rows: document.querySelectorAll('#l-table tbody tr').length,
      note: document.querySelector('#tk-year') ? document.querySelector('#tk-year').textContent.slice(0,80) : null,
      hero: document.querySelector('#hs-rows').textContent
    };
  })()`, sessionId);
  console.log('checks', JSON.stringify(checks));

  await c.shot('overview-full.png', sessionId);

  // filter interaction: click Physics chip + set search
  await c.eval(`(function(){
    document.querySelector('#chips-cat .chip[data-cat="Physics"]').click();
  })()`, sessionId);
  await sleep(400);
  const filtered = await c.eval(`document.querySelector('#fcount').textContent`, sessionId);
  console.log('after Physics filter:', filtered);
  await c.shot('overview-filtered.png', sessionId);

  // reset
  await c.eval(`document.querySelector('#reset').click()`, sessionId);
  await sleep(300);

  // people tab + modal
  await c.eval(`document.querySelector('[data-tab="people"]').click()`, sessionId);
  await sleep(500);
  await c.eval(`document.querySelector('#l-table tbody tr').click()`, sessionId);
  await sleep(500);
  const modalOpen = await c.eval(`document.querySelector('#modal').classList.contains('open')`, sessionId);
  console.log('modal open:', modalOpen);
  await c.shot('modal.png', sessionId, { captureBeyondViewport: false });

  await c.eval(`document.querySelector('#modal-close').click()`, sessionId);
  await sleep(300);

  // search
  await c.eval(`(function(){
    const q = document.querySelector('#q');
    q.value = 'curie';
    q.dispatchEvent(new Event('input', {bubbles:true}));
  })()`, sessionId);
  await sleep(700);
  const searchCount = await c.eval(`document.querySelector('#fcount').textContent`, sessionId);
  console.log('search curie:', searchCount);
  await c.shot('people-search.png', sessionId);

  await c.eval(`document.querySelector('#reset').click()`, sessionId);
  await sleep(300);

  // chat assistant
  await c.eval(`document.querySelector('#chat-fab').click()`, sessionId);
  await sleep(400);
  const chatOpen = await c.eval(`document.querySelector('#chat').classList.contains('open')`, sessionId);
  console.log('chat open:', chatOpen);
  await c.shot('chat-open.png', sessionId, { captureBeyondViewport: false });

  const ask = async (q) => {
    await c.eval(`(function(){
      const i = document.querySelector('#chat-input');
      i.value = ${JSON.stringify(q)};
      document.querySelector('#chat-form').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
    })()`, sessionId);
    await sleep(1200);
    const txt = await c.eval(`(function(){
      const m = document.querySelectorAll('#chat-log .msg.bot .msg-body');
      return m[m.length-1] ? m[m.length-1].innerText.replace(/\\s+/g,' ').slice(0,240) : null;
    })()`, sessionId);
    console.log('Q:', q, '\n  A:', txt);
    return txt;
  };

  await ask('Who won Physics in 1969?');
  await ask('Which country has the most laureates?');
  await ask('How many women have won?');
  await ask('Tell me about Marie Curie');
  await ask('Who is the youngest laureate?');
  await ask('Explain brain drain');
  await c.shot('chat-answers.png', sessionId, { captureBeyondViewport: false });

  // chat with filters on
  await c.eval(`document.querySelector('#chat-filter').click()`, sessionId);
  await sleep(300);
  await ask('How many laureates in total?');

  await c.eval(`document.querySelector('#chat-close').click()`, sessionId);
  await sleep(300);

  // explore: change to institution + line chart
  await c.eval(`document.querySelector('[data-tab="explore"]').click()`, sessionId);
  await sleep(500);
  await c.eval(`(function(){
    const x = document.querySelector('#x-sel'); x.value='inst'; x.dispatchEvent(new Event('change',{bubbles:true}));
    const t = document.querySelector('#type-sel'); t.value='vbar'; t.dispatchEvent(new Event('change',{bubbles:true}));
  })()`, sessionId);
  await sleep(500);
  await c.shot('explore-builder.png', sessionId);

  // dark mode overview
  await c.eval(`document.querySelector('[data-tab="overview"]').click()`, sessionId);
  await sleep(400);
  await c.eval(`document.querySelector('#theme').click()`, sessionId);
  await sleep(700);
  await c.shot('overview-dark.png', sessionId);
  await c.eval(`document.querySelector('#theme').click()`, sessionId);

  // geo tab dark
  await c.eval(`document.querySelector('[data-tab="geo"]').click()`, sessionId);
  await sleep(600);
  await c.shot('geo-light.png', sessionId);

  // mobile
  await c.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, sessionId);
  await c.eval(`document.querySelector('[data-tab="overview"]').click()`, sessionId);
  await sleep(800);
  await c.shot('mobile-overview.png', sessionId);

  // time tab at mobile width
  await c.eval(`document.querySelector('[data-tab="time"]').click()`, sessionId);
  await sleep(700);
  await c.shot('mobile-time.png', sessionId);

  // mobile chat
  await c.eval(`document.querySelector('#chat-fab').click()`, sessionId);
  await sleep(500);
  await c.shot('mobile-chat.png', sessionId, { captureBeyondViewport: false });
  await c.eval(`document.querySelector('#chat-close').click()`, sessionId);
  await sleep(200);

  console.log('--- console problems ---');
  console.log(c.logs.length ? c.logs.join('\n') : 'none');

  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
