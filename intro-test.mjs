// intro-test.mjs — SYMPHONY homepage intro splash harness (Node,
// stubbed DOM / localStorage / matchMedia). Covers: once-per-
// visitor flag gating (no overlay nodes for returning visitors),
// Skip / Esc dismissal, the end-card flow, the "Hear a melody"
// wiring into SymphonyMelody.playAddress with the worked-example
// fixture address, prefers-reduced-motion static card, and the
// footer replay link. Run: node intro-test.mjs
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) passed++;
  else { failed++; console.log("FAIL:", label); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC = readFileSync(new URL("./site/intro.js", import.meta.url), "utf8");
const EXAMPLE = "0x7c2F6872De3678530D34fca7dEBbEFfc9dA73475";

// ---------- DOM stubs ----------
let allEls = [];
let pageEls = {};
function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], parent: null, hidden: false, textContent: "", innerHTML: "",
    style: {}, attrs: {}, _handlers: {}, _classes: new Set(),
    removed: false, focused: false, scrolled: false, type: "", src: "", alt: "",
    classList: {
      add: (...cs) => cs.forEach((c) => el._classes.add(c)),
      remove: (...cs) => cs.forEach((c) => el._classes.delete(c)),
      contains: (c) => el._classes.has(c),
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return el.attrs[k]; },
    appendChild(c) { c.parent = el; el.children.push(c); allEls.push(c); return c; },
    addEventListener(ev, fn) { (el._handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      const a = el._handlers[ev] || []; const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    fire(ev, arg) {
      (el._handlers[ev] || []).slice().forEach((fn) =>
        fn(arg || { preventDefault() {}, key: "" }));
    },
    click() { el.fire("click", { preventDefault() {} }); },
    remove() {
      el.removed = true;
      if (el.parent) {
        const i = el.parent.children.indexOf(el);
        if (i >= 0) el.parent.children.splice(i, 1);
        el.parent = null;
      }
    },
    focus() { el.focused = true; },
    scrollIntoView() { el.scrolled = true; },
  };
  Object.defineProperty(el, "className", {
    get() { return [...el._classes].join(" "); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}
function findByClass(root, cls) {
  if (!root) return null;
  if (root._classes && root._classes.has(cls)) return root;
  for (const c of root.children || []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

function makeEnv({ flag = false, reduced = false } = {}) {
  allEls = [];
  const store = {};
  if (flag) store["symphony-intro-seen"] = "1";
  const playCalls = [];
  pageEls = {
    replayIntroLink: makeEl("a"),
    melodyCard: makeEl("div"),
    prelude: makeEl("section"),
  };
  pageEls.melodyCard.hidden = true; // no wallet connected in these scenarios
  const doc = {
    _handlers: {},
    body: makeEl("body"),
    createElement(tag) { return makeEl(tag); },
    getElementById(id) {
      if (pageEls[id]) return pageEls[id];
      return allEls.find((e) => e.id === id) || null;
    },
    addEventListener(ev, fn) { (doc._handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      const a = doc._handlers[ev] || []; const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    fire(ev, arg) { (doc._handlers[ev] || []).slice().forEach((fn) => fn(arg)); },
  };
  globalThis.window = {
    t: (k) => k,
    matchMedia: () => ({ matches: reduced }),
    SymphonyMelody: { playAddress: (a) => playCalls.push(a) },
  };
  globalThis.document = doc;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  (0, eval)(SRC);
  return { store, playCalls, doc, intro: globalThis.window.SymphonyIntro };
}
const splashOf = (doc) => findByClass(doc.body, "intro-splash");

// ---------- 1. returning visitor: no overlay at all ----------
{
  const { doc } = makeEnv({ flag: true });
  ok(doc.body.children.length === 0, "flag set → zero overlay nodes created");
  ok(!splashOf(doc), "flag set → no splash in DOM");
}

// ---------- 2. first visit + Skip ----------
{
  const { doc, store } = makeEnv();
  const splash = splashOf(doc);
  ok(!!splash, "first visit → splash created");
  const skip = findByClass(splash, "intro-skip");
  ok(!!skip, "skip button present from second 0");
  ok(doc.body.style.overflow === "hidden", "scroll locked while splash open");
  skip.click();
  ok(store["symphony-intro-seen"] === "1", "skip sets the seen flag");
  await sleep(500); // default fade 450 ms
  ok(splash.removed, "skip → overlay removed from DOM");
  ok(doc.body.style.overflow === "", "scroll restored after removal");
}

// ---------- 3. Esc dismissal ----------
{
  const { doc, store } = makeEnv();
  ok(!!splashOf(doc), "esc scenario → splash created");
  doc.fire("keydown", { key: "Escape" });
  ok(store["symphony-intro-seen"] === "1", "esc sets the seen flag");
}

// ---------- 4. end card flow + auto-dismiss, no sound ----------
{
  const env = makeEnv();
  env.intro.timings.scene = 40;
  env.intro.timings.card = 30;
  env.intro.timings.fade = 10;
  env.intro.dismiss(); // clear the auto-show instance + its 10 s timer
  await sleep(30); // let the fade-out removal land before re-showing
  delete env.store["symphony-intro-seen"];
  env.intro.show();
  const splash = splashOf(env.doc);
  ok(!!splash, "show() → splash created");
  const card = findByClass(splash, "intro-card");
  ok(card.hidden === true, "end card hidden during the scene");
  await sleep(70);
  ok(card.hidden === false, "end card appears when the scene ends");
  const line = findByClass(card, "intro-line-text");
  ok(line && line.textContent === "intro_line", "closing line rendered via i18n");
  await sleep(60);
  ok(env.store["symphony-intro-seen"] === "1", "auto-dismiss sets the flag");
  ok(env.playCalls.length === 0, "auto-dismiss plays NO sound");
  await sleep(30);
  ok(splash.removed, "auto-dismiss removes the overlay");
}

// ---------- 5. "Hear a melody" → playAddress(fixture) + scroll ----------
{
  const env = makeEnv();
  env.intro.timings.scene = 30;
  env.intro.timings.card = 60000; // card must not auto-dismiss mid-test
  env.intro.timings.fade = 10;
  env.intro.dismiss();
  await sleep(30); // let the fade-out removal land before re-showing
  delete env.store["symphony-intro-seen"];
  env.intro.show();
  const splash = splashOf(env.doc);
  await sleep(50);
  const hear = findByClass(splash, "intro-hear");
  ok(!!hear, "hear-a-melody button present on the end card");
  hear.click();
  ok(env.playCalls.length === 1 && env.playCalls[0] === EXAMPLE,
    "hear click plays the worked-example melody via playAddress");
  ok(env.store["symphony-intro-seen"] === "1", "hear click sets the flag");
  ok(pageEls.prelude.scrolled === true, "hear click scrolls to the Your Melody section");
  env.intro.dismiss();
}

// ---------- 6. reduced motion: static card, no scene ----------
{
  const { doc, store } = makeEnv({ reduced: true });
  const splash = splashOf(doc);
  ok(!!splash && splash._classes.has("intro-static"), "reduced motion → static splash");
  ok(!findByClass(splash, "intro-scene-wrap"), "reduced motion → no animated scene");
  const card = findByClass(splash, "intro-card");
  ok(card && card.hidden === false, "reduced motion → end card visible immediately");
  const poster = findByClass(splash, "intro-poster");
  ok(!!poster && poster._classes.has("intro-poster-static"), "reduced motion → static poster");
  findByClass(splash, "intro-skip").click();
  ok(store["symphony-intro-seen"] === "1", "reduced motion → skip sets the flag");
}

// ---------- 7. footer replay link ----------
{
  const env = makeEnv({ flag: true });
  ok(!splashOf(env.doc), "replay scenario → no splash while flag set");
  pageEls.replayIntroLink.click();
  ok(!!splashOf(env.doc), "replay click re-opens the splash");
  findByClass(splashOf(env.doc), "intro-skip").click();
  ok(env.store["symphony-intro-seen"] === "1", "replay → dismissal sets the flag again");
}

console.log(`intro-test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
