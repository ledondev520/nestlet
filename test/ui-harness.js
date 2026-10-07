import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { SYNTHETIC_CASE } from './fixtures/case.js';

let serial = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));
export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

/** DOM/event tests only. This is not a browser, layout engine, or screenshot source. */
export async function openApp({ status = {}, fetchHandler, bitmapHandler } = {}) {
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="app"></div></body></html>', { url: 'http://nestlet.test/' });
  const { window } = dom;
  const saved = new Map();
  const urls = new Map();
  const downloads = [];
  const revokedUrls = [];
  const clipboard = [];
  const requests = [];
  const confirmations = [];
  const answers = [];
  let prints = 0;
  const set = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.matchMedia = () => ({ matches: false });
  window.print = () => { prints++; };
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ name: this.download, blob: urls.get(this.href) });
  };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { const url = `blob:http://nestlet.test/${urls.size}`; urls.set(url, blob); return url; };
  URL.revokeObjectURL = url => { revokedUrls.push(url); };
  if (bitmapHandler) set('createImageBitmap', bitmapHandler);
  set('window', window);
  set('document', window.document);
  set('navigator', { clipboard: { writeText: async text => { clipboard.push(text); } } });
  set('confirm', text => { confirmations.push(text); return answers.length ? answers.shift() : true; });
  set('fetch', async (url, options) => {
    requests.push({ url, options });
    if (url === '/api/status') return { ok: true, json: async () => ({ liveEnabled: false, pdfEnabled: false, ...status }) };
    if (fetchHandler) return fetchHandler(url, options);
    throw new Error(`Unexpected test network request: ${url}`);
  });
  const close = () => {
    dom.window.close();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  try {
    await import(`../public/app.js?ui-test=${++serial}`);
    await tick();
  } catch (error) { close(); throw error; }
  const get = id => {
    const element = window.document.getElementById(id);
    assert.ok(element, `Expected visible UI element #${id}`);
    return element;
  };
  return {
    window, document: window.document, downloads, clipboard, requests, confirmations, answers, revokedUrls,
    get, close, flush: tick, get prints() { return prints; },
    click(id) { get(id).click(); },
    type(id, value) { const el = get(id); el.focus(); el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); },
    check(id, value = true) { const el = get(id); assert.equal(el.disabled, false); el.checked = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); },
    select(id, value) { const el = get(id); el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); },
    file(file) { const el = get('file'); Object.defineProperty(el, 'files', { configurable: true, value: [file] }); el.dispatchEvent(new window.Event('change', { bubbles: true })); },
  };
}

export function loadSample(app) {
  app.type('input', SYNTHETIC_CASE);
  app.click('extract');
}
export function reviewAll(app) {
  for (let index = 0; index < 5; index++) app.check(`confirm-${index}`);
}
