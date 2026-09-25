// 헤드리스 Chrome으로 index.html을 열어 콘솔 에러·예외, 가로 스크롤, 진단 상태를 점검하고 스크린샷을 남긴다.
// 외부 의존성 없음 (Node 22+ 내장 WebSocket + Chrome DevTools Protocol).
//
//   node tools/smoke.mjs                  데스크톱·폰 두 시나리오 점검, 스크린샷은 .smoke/ 에 저장
//   node tools/smoke.mjs --wait 8000      로드 뒤 관찰 시간(ms, 기본 5000)
//   node tools/smoke.mjs --og docs/og.jpg 1200×630 공유 이미지만 캡처
//   node tools/smoke.mjs --shot docs/screenshot.png --size 1600x900
//   node tools/smoke.mjs --shot docs/screenshot-phone.png --size 390x844 --mobile   폰(터치·DPR 2) 레이아웃으로 캡처
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

async function openPage(browser, { width, height, dpr = 1, mobile = false }) {
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
  await s('Page.navigate', { url: pageUrl });
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

async function runScenario(browser, name, viewport) {
  const page = await openPage(browser, viewport);
  await sleep(waitMs);
  const before = await page.evaluate(PROBE);
  const seenProblems = page.problems.length;
  const fails = page.problems.slice(0, seenProblems);
  if (!before.title) fails.push('<title>이 비어 있음');
  if (before.overflowX) fails.push(`가로 스크롤 발생 (scrollWidth ${before.scrollWidth} > ${before.clientWidth})`);
  if (!before.stageRect) fails.push('#stage 캔버스가 없음');
  if (!before.diag) fails.push('window.__pamun.diag() 진단 훅이 없음');

  let after = null;
  if (before.stageRect) {
    const { x, y, w, h } = before.stageRect;
    await page.tap(x + w * 0.62, y + h * 0.45);
    await sleep(1200);
    after = await page.evaluate(PROBE);
  }
  const shot = await page.screenshot(join(outDir, `smoke-${name}.png`));
  fails.push(...page.problems.slice(seenProblems)); // 탭 이후에 새로 생긴 문제
  return { name, viewport, fails, before, after, shot };
}

async function main() {
  const browser = await launch();
  try {
    if (ogPath || shotPath) {
      const [w, h] = ogPath ? [1200, 630] : shotSize.split('x').map(Number);
      const page = await openPage(browser, shotMobile && !ogPath ? { width: w, height: h, dpr: 2, mobile: true } : { width: w, height: h, dpr: 1 });
      await sleep(waitMs);
      const file = resolve(root, ogPath || shotPath);
      const isJpg = /\.jpe?g$/i.test(file);
      await page.screenshot(file, isJpg ? 'jpeg' : 'png', isJpg ? 88 : undefined);
      console.log(JSON.stringify({ saved: file, problems: page.problems }, null, 2));
      process.exitCode = page.problems.length ? 1 : 0;
      return;
    }
    const results = [];
    results.push(await runScenario(browser, 'desktop', { width: 1280, height: 720, dpr: 1 }));
    results.push(await runScenario(browser, 'phone', { width: 390, height: 844, dpr: 3, mobile: true }));
    console.log(JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.fails.length);
    console.log(failed.length ? `\nFAIL: ${failed.map((r) => `${r.name}(${r.fails.length})`).join(', ')}` : '\nPASS');
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
