import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function setup({ supported = true } = {}) {
  const component = read('src/components/DeferredFeaturedPlayer.astro').split('---')[2].split('<script')[0]
    .replace('data-game-url={embedUrl}', 'data-game-url="/play/glowpath/"')
    .replace('data-game-title={title}', 'data-game-title="GlowPath"');
  const dom = new JSDOM(`<section data-player-shell><button data-player-fullscreen disabled>Fullscreen</button>${component}</section>`, {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => supported ? { getExtension: () => null } : null;
  let timeout;
  window.setTimeout = callback => { timeout = callback; return 1; };
  window.clearTimeout = () => { timeout = null; };
  window.eval(read('public/scripts/featured-player.js'));
  return { dom, document: window.document, expire: () => timeout?.() };
}

test('homepage ships a poster and Play button without iframe, game preload, or game script', () => {
  const page = read('src/pages/index.astro');
  const component = read('src/components/DeferredFeaturedPlayer.astro');
  assert.doesNotMatch(page + component, /<iframe|rel="(?:preload|prefetch)"|src=.*(?:\.wasm|\.pck|play\/glowpath)/);
  assert.match(page, /<DeferredFeaturedPlayer/);
  assert.match(component, /<button[^>]+data-featured-play/);
  const { dom, document } = setup();
  try {
    assert.equal(document.querySelectorAll('iframe').length, 0);
    assert.equal(document.querySelector('[data-featured-play]').disabled, false);
  } finally { dom.window.close(); }
});

test('one deliberate activation creates one titled iframe and load does not claim engine readiness', () => {
  const { dom, document } = setup();
  try {
    const play = document.querySelector('[data-featured-play]');
    play.click(); play.click();
    assert.equal(document.querySelectorAll('iframe').length, 1);
    assert.equal(document.querySelector('iframe').title, 'GlowPath featured game');
    assert.match(document.querySelector('[data-featured-status]').textContent, /Opening the game page/);
    document.querySelector('iframe').dispatchEvent(new dom.window.Event('load'));
    assert.match(document.querySelector('[data-featured-status]').textContent, /Engine startup continues/);
    assert.equal(document.querySelector('[data-player-fullscreen]').disabled, false);
    assert.equal(document.activeElement, document.querySelector('[data-featured-retry]'));
  } finally { dom.window.close(); }
});

test('failure is announced, retry replaces the iframe, and stale events cannot update the new attempt', () => {
  const { dom, document } = setup();
  try {
    document.querySelector('[data-featured-play]').click();
    const old = document.querySelector('iframe');
    old.dispatchEvent(new dom.window.Event('error'));
    assert.match(document.querySelector('[data-featured-status]').textContent, /could not be opened/);
    document.querySelector('[data-featured-retry]').click();
    assert.equal(document.querySelectorAll('iframe').length, 1);
    assert.notEqual(document.querySelector('iframe'), old);
    old.dispatchEvent(new dom.window.Event('load'));
    assert.match(document.querySelector('[data-featured-status]').textContent, /Opening the game page/);
  } finally { dom.window.close(); }
});

test('slow page message permits waiting and does not invent progress or ready state', () => {
  const { dom, document, expire } = setup();
  try {
    document.querySelector('[data-featured-play]').click(); expire();
    assert.match(document.querySelector('[data-featured-status]').textContent, /keep waiting/);
    assert.equal(document.querySelectorAll('iframe').length, 1);
    assert.doesNotMatch(document.querySelector('[data-featured-status]').textContent, /\d+%|ready to play/i);
  } finally { dom.window.close(); }
});

test('unsupported WebGL 2 gives a friendly fallback and retry never downloads an engine', () => {
  const { dom, document } = setup({ supported: false });
  try {
    document.querySelector('[data-featured-play]').click();
    assert.match(document.querySelector('[data-featured-status]').textContent, /cannot provide WebGL 2/);
    document.querySelector('[data-featured-retry]').click();
    assert.equal(document.querySelectorAll('iframe').length, 0);
    assert.equal(document.querySelector('[data-player-fullscreen]').disabled, true);
  } finally { dom.window.close(); }
});
