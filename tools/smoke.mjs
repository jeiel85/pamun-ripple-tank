// 헤드리스 Chrome으로 index.html을 열어 콘솔 에러·예외, 가로 스크롤, 진단 상태를 점검하고 스크린샷을 남긴다.
// 외부 의존성 없음 (Node 22+ 내장 WebSocket + Chrome DevTools Protocol).
//
//   node tools/smoke.mjs                  데스크톱·폰·영어 데스크톱 세 시나리오 점검, 스크린샷은 .smoke/ 에 저장
//   node tools/smoke.mjs --wait 8000      로드 뒤 관찰 시간(ms, 기본 5000)
//   node tools/smoke.mjs --og docs/og.jpg 1200×630 공유 이미지만 캡처
//   node tools/smoke.mjs --shot docs/screenshot.png --size 1600x900
//   node tools/smoke.mjs --shot docs/screenshot-phone.png --size 390x844 --mobile   폰(터치·DPR 2) 레이아웃으로 캡처
//   --dismiss                             캡처 전에 첫 화면 카드를 닫는다(--shot·--og)
//   --query "?lang=en"                    주소 뒤에 붙일 문자열(언어·공유 링크 #t= 등)
//
// 기본 점검: 데스크톱(공유 링크 왕복·클립 녹화 포함), 폰, 영어 데스크톱(보이는 UI에 한글이 남았는지).
//
// CHROME_PATH 환경 변수로 브라우저 경로를 바꿀 수 있다. 실패 항목이 있으면 종료 코드 1.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const pageUrl = opt('--url', pathToFileURL(join(root, 'index.html')).href);
const waitMs = Number(opt('--wait', '5000'));
const outDir = resolve(root, opt('--out', '.smoke'));
const ogPath = opt('--og', null);
const shotPath = opt('--shot', null);
const shotSize = opt('--size', '1600x900');
const shotMobile = args.includes('--mobile');
const shotDismiss = args.includes('--dismiss');
const shotQuery = opt('--query', '');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome을 찾지 못했습니다. CHROME_PATH를 지정하세요.');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'pamun-smoke-'));
  const proc = spawn(findChrome(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    'about:blank',
  ], { stdio: 'ignore' });

  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error('Chrome DevTools 포트를 열지 못했습니다.');
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');

  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message} (${msg.error.code})`)) : res(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  const close = async () => {
    try { await send('Browser.close'); } catch { /* 이미 닫힘 */ }
    ws.close();
    await sleep(300);
    proc.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 잠금이 풀린 뒤 OS가 정리 */ }
  };
  return { send, listeners, close };
}

async function openPage(browser, { width, height, dpr = 1, mobile = false, query = '' }) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => browser.send(method, params, sessionId);

  const problems = [];
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push(`예외: ${d.exception?.description || d.text} @${d.lineNumber}:${d.columnNumber}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const e = msg.params.entry;
      // 폰트 CDN 오프라인 실패는 페이지가 fallback으로 처리하므로 경고로만 본다.
      if (!/fonts\.(googleapis|gstatic)\.com/.test(e.url || '')) problems.push(`log.error: ${e.text} ${e.url || ''}`);
    }
  };
  browser.listeners.add(onEvent);

  await s('Runtime.enable');
  await s('Log.enable');
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const loaded = new Promise((res) => {
    const fn = (msg) => {
      if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') {
        browser.listeners.delete(fn);
        res();
      }
    };
    browser.listeners.add(fn);
  });
  await s('Page.navigate', { url: pageUrl + query });
  await Promise.race([loaded, sleep(15000)]);

  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const screenshot = async (file, format = 'png', quality) => {
    const { data } = await s('Page.captureScreenshot', { format, quality, captureBeyondViewport: false });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };
  const tap = async (x, y) => {
    if (mobile) {
      await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  return { evaluate, screenshot, tap, problems };
}

// 첫 화면 카드를 '소리 없이 보기'로 닫는다(카드가 수조 탭을 가로막으므로 탭 점검 전에 닫아야 한다).
// 합성 click()은 키보드 조작처럼 취급되어 수조 포커스 링·조준경이 그려지므로 스크린샷을 위해 포커스를 푼다.
const DISMISS = `(() => { const b = document.getElementById('intro-quiet'); const open = !document.getElementById('intro').hidden; if (open) { b.click(); document.getElementById('stage').blur(); } return open; })()`;
// 보이는 UI 문구(캔버스 제외)에 한글이 남았는지 — 영어 화면 점검용. 언어 선택 목록의 '한국어'는 뺀다.
const HANGUL_LEFT = `(() => {
  const out = [];
  const walk = (el) => {
    if (el.closest('[hidden]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'OPTION' && el.lang === 'ko') return;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && /[\\uAC00-\\uD7A3]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 60));
      else if (n.nodeType === 1) walk(n);
    }
    for (const a of ['aria-label', 'title']) { const v = el.getAttribute(a); if (v && /[\\uAC00-\\uD7A3]/.test(v)) out.push('@' + a + ': ' + v.slice(0, 60)); }
  };
  walk(document.body);
  if (/[\\uAC00-\\uD7A3]/.test(document.title)) out.push('title: ' + document.title);
  return out.filter((t) => t !== '언어 · Language');
})()`;
// 공유 링크 왕복: 지금 수조 → 코드 → 풀어서 울림돌·방울 시계 수가 같은지
const SHARE_ROUNDTRIP = `(async () => {
  const code = await window.__pamun.shareCode();
  const d = await window.__pamun.decodeShare(code);
  const g = window.__pamun.diag();
  const bad = await window.__pamun.decodeShare('z' + 'A'.repeat(40)).catch(() => null);
  return { len: code.length, kind: code[0], ok: !!d && d.stones.length === g.stones.length && d.droppers.length === g.droppers && d.walls.length === g.walls, rejectsGarbage: bad === null };
})()`;
// 클립 녹화: 녹화 버튼 → 6 s → 다시 눌러 멈춤 → 클립 시트에 영상이 붙었는지. 헤드리스 소프트웨어 인코더는
// 첫 조각과 마지막 조각이 늦게 나오기도 해서, 시트나 실패 안내가 뜰 때까지 최대 15 s 기다린다.
const RECORD = `(async () => {
  const b = document.getElementById('rec-btn');
  if (b.hidden) return { supported: false };
  b.click();
  const started = window.__pamun.diag().recording;
  await new Promise((r) => setTimeout(r, 6000));
  b.click();
  const hint = () => document.getElementById('hint').textContent;
  for (let i = 0; i < 150 && document.getElementById('clip-sheet').hidden && !/녹화에 실패|너무 짧아/.test(hint()); i++) await new Promise((r) => setTimeout(r, 100));
  const sheet = !document.getElementById('clip-sheet').hidden;
  const a = document.getElementById('clip-save');
  const res = { supported: true, started, sheet, file: a.download, href: a.href.slice(0, 5), hint: document.getElementById('hint').textContent };
  document.getElementById('clip-close').click();
  return res;
})()`;

const PROBE = `(() => {
  const de = document.documentElement;
  const diag = typeof window.__pamun?.diag === 'function' ? window.__pamun.diag() : null;
  const stage = document.getElementById('stage');
  const r = stage ? stage.getBoundingClientRect() : null;
  return {
    title: document.title,
    overflowX: de.scrollWidth > de.clientWidth + 1,
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    stageRect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
    diag,
  };
})()`;

async function runScenario(browser, name, viewport, { query = '', extra = false } = {}) {
  const page = await openPage(browser, { ...viewport, query });
  await sleep(waitMs);
  const before = await page.evaluate(PROBE);
  const seenProblems = page.problems.length;
  const fails = page.problems.slice(0, seenProblems);
  if (!before.title) fails.push('<title>이 비어 있음');
  if (before.overflowX) fails.push(`가로 스크롤 발생 (scrollWidth ${before.scrollWidth} > ${before.clientWidth})`);
  if (!before.stageRect) fails.push('#stage 캔버스가 없음');
  if (!before.diag) fails.push('window.__pamun.diag() 진단 훅이 없음');
  else if (!before.diag.intro) fails.push('첫 화면 카드가 떠 있지 않음');
  const shotIntro = await page.screenshot(join(outDir, `smoke-${name}-intro.png`));

  const checks = {};
  checks.dismissed = await page.evaluate(DISMISS);
  if (/lang=en/.test(query)) {
    checks.hangulLeft = await page.evaluate(HANGUL_LEFT);
    if (checks.hangulLeft.length) fails.push(`영어 화면에 한글 문구가 남음: ${checks.hangulLeft.join(' | ')}`);
  }
  if (extra) {
    checks.share = await page.evaluate(SHARE_ROUNDTRIP);
    if (!checks.share.ok) fails.push(`공유 링크 왕복 실패: ${JSON.stringify(checks.share)}`);
    if (!checks.share.rejectsGarbage) fails.push('망가진 공유 코드를 거부하지 않음');
    checks.record = await page.evaluate(RECORD);
    if (checks.record.supported && !(checks.record.started && checks.record.sheet && checks.record.href === 'blob:')) fails.push(`클립 녹화 실패: ${JSON.stringify(checks.record)}`);
  }

  let after = null;
  if (before.stageRect) {
    const { x, y, w, h } = before.stageRect;
    await page.tap(x + w * 0.62, y + h * 0.45);
    await sleep(1200);
    after = await page.evaluate(PROBE);
  }
  const shot = await page.screenshot(join(outDir, `smoke-${name}.png`));
  fails.push(...page.problems.slice(seenProblems)); // 카드를 닫은 뒤·탭 이후에 새로 생긴 문제
  return { name, viewport, query, fails, checks, before, after, shots: [shotIntro, shot] };
}

async function main() {
  const browser = await launch();
  try {
    if (ogPath || shotPath) {
      const [w, h] = ogPath ? [1200, 630] : shotSize.split('x').map(Number);
      const vp = shotMobile && !ogPath ? { width: w, height: h, dpr: 2, mobile: true } : { width: w, height: h, dpr: 1 };
      const page = await openPage(browser, { ...vp, query: shotQuery });
      if (shotDismiss) { await sleep(1500); await page.evaluate(DISMISS); }
      await sleep(waitMs);
      const file = resolve(root, ogPath || shotPath);
      const isJpg = /\.jpe?g$/i.test(file);
      await page.screenshot(file, isJpg ? 'jpeg' : 'png', isJpg ? 88 : undefined);
      console.log(JSON.stringify({ saved: file, problems: page.problems }, null, 2));
      process.exitCode = page.problems.length ? 1 : 0;
      return;
    }
    const results = [];
    results.push(await runScenario(browser, 'desktop', { width: 1280, height: 720, dpr: 1 }, { extra: true }));
    results.push(await runScenario(browser, 'phone', { width: 390, height: 844, dpr: 3, mobile: true }));
    results.push(await runScenario(browser, 'desktop-en', { width: 1280, height: 720, dpr: 1 }, { query: '?lang=en' }));
    console.log(JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.fails.length);
    console.log(failed.length ? `\nFAIL: ${failed.map((r) => `${r.name}(${r.fails.length})`).join(', ')}` : '\nPASS');
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
