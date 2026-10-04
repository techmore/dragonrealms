import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
  const listeners = {};
  const document = { activeElement: null,
    addEventListener(key, fn, capture) { listeners[key] = { fn, capture }; },
    querySelectorAll: () => [], querySelector: () => null };
  function control(type, id) {
    return { dataset: { col: id },
      classList: { contains: (name) => name === type },
      closest: () => ({ dataset: { w: id } }),
      focus() { document.activeElement = this; },
      addEventListener() {} };
  }
  let controls = new Map();
  const menu = { hidden: true,
    contains: (active) => [...controls.values()].includes(active),
    set innerHTML(value) {
      const focusedInside = this.contains(document.activeElement);
      this.html = value;
      controls = new Map();
      for (const id of ['status-strip', 'hands-bar']) {
        for (const type of ['wmenu-vis', 'wmenu-col']) {
          controls.set(`[data-w="${id}"] .${type}`, control(type, id));
        }
      }
      controls.set('.wmenu-sims', control('wmenu-sims'));
      if (focusedInside) document.activeElement = null;
    },
    querySelector: (selector) => controls.get(selector), querySelectorAll: () => [] };
  const opener = { classList: { contains: () => false }, attributes: {}, addEventListener(key, fn) { this[key] = fn; },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { document.activeElement = this; } };
  const elements = { 'windows-menu': menu, 'windows-btn': opener };
  const context = vm.createContext({ document, $: (id) => elements[id], window: {},
    localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(readFileSync(new URL('../public/js/windows.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, ''), context);
  return { context, document, menu, opener, listeners };
}

test('Windows rerender restores the same checkbox or collapse control and Sims link', () => {
  const h = harness();
  for (const selector of ['[data-w="status-strip"] .wmenu-vis', '[data-w="hands-bar"] .wmenu-col', '.wmenu-sims']) {
    h.context.renderWindowsMenu();
    const prior = h.menu.querySelector(selector);
    prior.focus();
    h.context.renderWindowsMenu();
    assert.notEqual(h.document.activeElement, prior);
    assert.equal(h.document.activeElement, h.menu.querySelector(selector));
  }
  h.document.activeElement = h.opener;
  h.context.renderWindowsMenu();
  assert.equal(h.document.activeElement, h.opener);
});

test('Escape closes Windows, updates expanded state and restores opener before global routing', () => {
  const h = harness();
  h.context.bindWindows();
  h.opener.click();
  assert.equal(h.menu.hidden, false);
  let prevented = false, stopped = false;
  h.listeners.keydown.fn({ key: 'Escape', preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.equal(h.listeners.keydown.capture, true);
  assert.equal(h.menu.hidden, true);
  assert.equal(h.opener.attributes['aria-expanded'], 'false');
  assert.equal(h.document.activeElement, h.opener);
  assert.equal(prevented && stopped, true);
});

test('keys overlay explains the alternate terminal font modifier', () => {
  const row = { textContent: 'font size up / down / reset', cells: [{}] };
  const element = { querySelectorAll: () => [row], addEventListener() {} };
  const context = vm.createContext({ $: () => element });
  vm.runInContext(readFileSync(new URL('../public/js/keys.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, ''), context);
  assert.match(row.cells[0].innerHTML, /Ctrl\/Cmd/);
  assert.match(row.cells[0].innerHTML, /Alt/);
});
