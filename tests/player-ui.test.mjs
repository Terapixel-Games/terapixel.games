import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function setup() {
  const nav = read('src/components/Nav.astro').split('---')[2];
  const dom = new JSDOM(`<body>${nav}<main class="site-main"><button data-auth-open>Login</button></main><footer class="site-footer"></footer></body>`, {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  // jsdom has no layout engine; model visibility for the focusable-element filter.
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.closest('.hidden') ? [] : [{}];
  };
  dom.window.eval(read('public/scripts/terapixel-identity.js'));
  await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  return dom;
}

test('toolbar login opens a labeled modal, traps both Tab boundaries, and Escape restores focus', async () => {
  const dom = await setup();
  try {
    const { document, KeyboardEvent } = dom.window;
    const opener = document.querySelector('main [data-auth-open]');
    const modal = document.getElementById('tpx-auth-modal');
    const close = document.getElementById('tpx-auth-close');
    const submit = document.getElementById('tpx-auth-submit');
    const email = document.getElementById('tpx-auth-email');
    opener.focus(); opener.click();
    assert.equal(modal.classList.contains('hidden'), false);
    assert.equal(document.activeElement, email);
    assert.equal(document.querySelector('label[for="tpx-auth-email"]').textContent, 'Email address');
    assert.equal(document.querySelector('main').inert, true);
    submit.focus();
    submit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, close);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, submit);
    submit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(modal.classList.contains('hidden'), true);
    assert.equal(document.activeElement, opener);
    assert.equal(!!document.querySelector('main').inert, false);
  } finally { dom.window.close(); }
});

test('authenticated controls update together and the modal initially focuses Close', async () => {
  const dom = await setup();
  try {
    const { document, TerapixelIdentity } = dom.window;
    TerapixelIdentity.setIdentity({ user_id: 'local-test-player' });
    for (const button of document.querySelectorAll('[data-auth-open]')) assert.equal(button.textContent, 'Account');
    assert.equal(document.getElementById("tpx-auth-account").classList.contains("hidden"), false);
    const opener = document.querySelector('main [data-auth-open]');
    opener.focus(); opener.click();
    assert.equal(document.activeElement.id, 'tpx-auth-close');
    assert.equal(document.getElementById('tpx-auth-email-label').classList.contains('hidden'), true);
    document.getElementById('tpx-auth-close').click();
    assert.equal(document.activeElement, opener);
  } finally { dom.window.close(); }
});

test('both game-first toolbars expose auth and Details links to the information anchor', () => {
  for (const page of ['index.astro', '[slug].astro']) {
    assert.match(read(`src/pages/${page}`), /class="portal-toolbar-actions">\s*<button[^>]+data-auth-open[^>]+aria-haspopup="dialog"/);
  }
  assert.match(read('src/components/GameCard.astro'), /href=\{`\$\{detailHref\}#game-info`\} class="btn btn-secondary"/);
  assert.match(read('src/pages/[slug].astro'), /id="game-info"/);
});

test('published instructions describe the verified mechanics and supported inputs', () => {
  const games = JSON.parse(read('src/data/games.json'));
  const game = slug => games.find(row => row.slug === slug);
  assert.match(game('lumarush').seoHowToPlay, /three.*horizontally|three.*edges/);
  assert.match(game('color-crunch').seoDetails, /4×4|Slide the whole board/);
  assert.match(game('color-crunch').controls.join(' '), /WASD/);
  assert.match(game('worm-breaker').seoIntro, /cylindrical tunnel brickbreaker/);
  assert.doesNotMatch(JSON.stringify(game('worm-breaker')), /WASD|escape lane|avoiding corners/);
  assert.doesNotMatch(JSON.stringify(game('lumarush')), /center block|surrounding blocks/);
});

test('Escape remains available while login is busy, without submitting a real login', async () => {
  const dom = await setup();
  try {
    const { document, KeyboardEvent } = dom.window;
    dom.window.TerapixelIdentity.config.loginUrl = 'https://example.test/login';
    // Replace the login action so this test cannot navigate or contact a backend.
    dom.window.TerapixelIdentity.startLogin = () => {};
    const opener = document.querySelector('main [data-auth-open]');
    opener.focus(); opener.click();
    document.getElementById('tpx-auth-submit').click();
    const close = document.getElementById('tpx-auth-close');
    assert.equal(document.getElementById('tpx-auth-submit').disabled, true);
    assert.equal(close.disabled, false);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.getElementById('tpx-auth-modal').classList.contains('hidden'), true);
    assert.equal(document.activeElement, opener);
  } finally { dom.window.close(); }
});


test('identity script is versioned with the deployed build to avoid stale auth handlers', () => {
  assert.match(read('src/layouts/BaseLayout.astro'), /identityScriptUrl = addBuildVersion\(withBasePath\('\/scripts\/terapixel-identity.js'\), import.meta.env.PUBLIC_TPX_BUILD_ID\)/);
});
