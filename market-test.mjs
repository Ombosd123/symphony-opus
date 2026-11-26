// market-test.mjs — SYMPHONY market section harness (Node, stubbed
// DOM / localStorage). Covers: the closed state that ships today
// (no MARKET_ADDRESS in config → banner + app hidden, pill stays
// "Coming Soon"), the pure filter/sort helpers, and — fed with
// LOCAL sample listings through SymphonyMarket.setListings, the
// same render pipeline refresh() uses — the open state: banner,
// "showing X of Y" count, load-more paging (16 per batch), the tier
// dropdown (one tier shows only its own listings), the price-sort
// dropdown, Magnum free-price floor line, the empty-tier state, and
// re-rendering in another language. Sample data lives ONLY in this
// file; nothing sample is shipped to the live site.
// Run: node market-test.mjs
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) passed++;
  else { failed++; console.log("FAIL:", label); }
}
const I18N_SRC = readFileSync(new URL("./site/i18n.js", import.meta.url), "utf8");
const MARKET_SRC = readFileSync(new URL("./site/market.js", import.meta.url), "utf8");

// ---------- DOM stubs (same shape as intro-test.mjs) ----------
let allEls = [];
function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], parent: null, hidden: false, textContent: "", innerHTML: "",
    style: {}, attrs: {}, _handlers: {}, _classes: new Set(),
    removed: false, type: "", src: "", alt: "", disabled: false,
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
  };
  Object.defineProperty(el, "className", {
    get() { return [...el._classes].join(" "); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}

const MK_IDS = ["mkSoon", "mkBanner", "mkBannerTitle", "mkBannerNote", "mkApp",
  "mkTierBtn", "mkTierMenu", "mkSortBtn", "mkSortMenu", "mkCount", "mkGrid",
  "mkMore", "mkStatus"];

function makeEnv() {
  allEls = [];
  const pageEls = {};
  for (const id of MK_IDS) pageEls[id] = makeEl("div");
  pageEls.mkBanner.hidden = true;
  pageEls.mkApp.hidden = true;
  pageEls.mkTierMenu.hidden = true;
  pageEls.mkSortMenu.hidden = true;
  pageEls.mkMore.hidden = true;
  const doc = {
    _handlers: {},
    body: makeEl("body"),
    documentElement: makeEl("html"),
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
    SYMPHONY_CONFIG: {
      MARKET_ADDRESS: "", PASS_ADDRESS: "", SALE_ADDRESS: "",
      MARKET_DEPLOY_BLOCK: 0, READ_RPC: "http://127.0.0.1:0",
      CHAIN_ID: 56, AGENT_ID_REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
      USDT_ADDRESS: "0x55d398326f99059fF775485246999027B3197955",
    },
  };
  globalThis.document = doc;
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  (0, eval)(I18N_SRC);
  (0, eval)(MARKET_SRC);
  return { doc, pageEls, market: globalThis.window.SymphonyMarket };
}

const E18 = (n) => BigInt(Math.round(n * 1e18));
function sampleListings() {
  const out = [];
  let id = 0;
  const pass = (tokenId, tier, price) => out.push({
    id: ++id, kind: 1, tokenId, tier,
    priceWei: E18(price), floorWei: E18([0, 0.8, 1.2, 1.6][tier]),
  });
  const magnum = (tokenId, price) => out.push({
    id: ++id, kind: 2, tokenId, tier: 0, priceWei: E18(price), floorWei: null,
  });
  [0.95, 0.88, 1.0, 0.9, 0.99, 1.05, 0.92, 1.1].forEach((p, i) => pass(101 + i, 1, p));
  [1.45, 1.6, 1.3, 1.5, 1.2].forEach((p, i) => pass(2101 + i, 2, p));
  [2.1, 1.95, 2.4, 1.7].forEach((p, i) => pass(4601 + i, 3, p));
  magnum(7, 25); magnum(12, 40); magnum(21, 9.5);
  return out; // 20 listings: 8 T1, 5 T2, 4 T3, 3 Magnum
}
const cardName = (card) => card.children[1].children[0].children[0].textContent;
const cardBadge = (card) => card.children[1].children[0].children[1].textContent;
const cardPrice = (card) => card.children[1].children[1].textContent;
const cardFloor = (card) => card.children[1].children[2].textContent;
const menuItem = (menu, key) => menu.children.find((c) => c.getAttribute("data-key") === key);

// ---------- 1. closed state (what ships today) ----------
{
  const { pageEls, market } = makeEnv();
  ok(market, "SymphonyMarket exposed");
  ok(pageEls.mkApp.hidden === true, "closed → market app hidden");
  ok(pageEls.mkBanner.hidden === true, "closed → banner hidden");
  ok(pageEls.mkSoon.textContent === "Coming Soon", "closed → pill shows Coming Soon");
  ok(pageEls.mkSoon.getAttribute("data-i18n") === "mk_soon", "closed → pill key mk_soon");
  ok(pageEls.mkGrid.children.length === 0, "closed → no cards rendered");
}

// ---------- 2. pure helpers ----------
{
  const { market } = makeEnv();
  ok(market.fmtUsdt(E18(0.95)) === "0.95", "fmtUsdt 0.95");
  ok(market.fmtUsdt(E18(1.2)) === "1.2", "fmtUsdt 1.2");
  ok(market.fmtUsdt(E18(25)) === "25", "fmtUsdt 25");
  ok(market.fmtUsdt(0n) === "0", "fmtUsdt 0");
  const ls = sampleListings();
  ok(market.applyView(ls, "ALL", "asc").length === 20, "applyView ALL = 20");
  ok(market.applyView(ls, "1", "asc").every((l) => l.kind === 1 && l.tier === 1), "applyView tier 1 only");
  ok(market.applyView(ls, "1", "asc").length === 8, "applyView tier 1 count 8");
  ok(market.applyView(ls, "MAGNUM", "asc").every((l) => l.kind === 2), "applyView MAGNUM only");
  const asc = market.applyView(ls, "ALL", "asc");
  ok(asc[0].priceWei === E18(0.88) && asc[asc.length - 1].priceWei === E18(40), "applyView asc by price");
  const desc = market.applyView(ls, "ALL", "desc");
  ok(desc[0].priceWei === E18(40) && desc[desc.length - 1].priceWei === E18(0.88), "applyView desc by price");
  ok(market.PAGE_SIZE >= 12 && market.PAGE_SIZE <= 20, "PAGE_SIZE within approved 12–20");
}

// ---------- 3. open state + load-more paging ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  ok(pageEls.mkApp.hidden === false, "open → app visible");
  ok(pageEls.mkBanner.hidden === false, "open → banner visible");
  ok(pageEls.mkSoon.textContent === "Market open", "open → pill shows Market open");
  ok(pageEls.mkSoon.getAttribute("data-i18n") === "mk_open", "open → pill key mk_open");
  ok(pageEls.mkBannerTitle.textContent.includes("Market open"), "open → banner title");
  ok(pageEls.mkCount.textContent === "Showing 16 of 20 listings", "count shows first batch");
  ok(pageEls.mkGrid.children.length === 16, "first batch renders 16 cards");
  ok(pageEls.mkMore.hidden === false, "load-more visible with remainder");
  ok(pageEls.mkMore.textContent === "Load more (4 more)", "load-more label counts remainder");
  pageEls.mkMore.click();
  ok(pageEls.mkGrid.children.length === 20, "load-more renders the rest");
  ok(pageEls.mkCount.textContent === "Showing 20 of 20 listings", "count after load-more");
  ok(pageEls.mkMore.hidden === true, "load-more hides when exhausted");
  const first = pageEls.mkGrid.children[0];
  ok(cardPrice(first) === "0.88 USDT", "default sort: cheapest card first");
  ok(cardName(first).startsWith("Pass #"), "card shows Pass number");
  ok(first.children[0].src.includes("pass-tier1-overture"), "tier 1 card uses tier 1 artwork");
}

// ---------- 4. tier dropdown: one tier shows only its own ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  pageEls.mkTierBtn.click();
  ok(pageEls.mkTierMenu.hidden === false, "tier menu opens");
  menuItem(pageEls.mkTierMenu, "1").click();
  ok(pageEls.mkTierMenu.hidden === true, "tier menu closes on pick");
  ok(pageEls.mkGrid.children.length === 8, "Overture filter renders 8 cards");
  ok(pageEls.mkGrid.children.every((c) => cardBadge(c) === "Overture"), "Overture filter: every badge Overture");
  ok(pageEls.mkCount.textContent === "Showing 8 of 8 listings", "count under filter");
  pageEls.mkTierBtn.click();
  menuItem(pageEls.mkTierMenu, "MAGNUM").click();
  ok(pageEls.mkGrid.children.length === 3, "Magnum filter renders 3 cards");
  ok(pageEls.mkGrid.children.every((c) => c.classList.contains("magnum")), "Magnum filter: magnum card style");
  ok(pageEls.mkGrid.children.every((c) => cardFloor(c) === "Free price — no floor"), "Magnum cards: free price, no floor");
  ok(pageEls.mkGrid.children.every((c) => cardName(c).startsWith("Opus Magnum #")), "Magnum card names");
}

// ---------- 5. sort dropdown ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  pageEls.mkSortBtn.click();
  ok(pageEls.mkSortMenu.hidden === false, "sort menu opens");
  menuItem(pageEls.mkSortMenu, "desc").click();
  ok(cardPrice(pageEls.mkGrid.children[0]) === "40 USDT", "desc: most expensive first");
  pageEls.mkSortBtn.click();
  menuItem(pageEls.mkSortMenu, "asc").click();
  ok(cardPrice(pageEls.mkGrid.children[0]) === "0.88 USDT", "asc: cheapest first");
}

// ---------- 6. empty tier + language re-render ----------
{
  const { doc, pageEls, market } = makeEnv();
  market.setListings(sampleListings().filter((l) => l.tier !== 3));
  pageEls.mkTierBtn.click();
  menuItem(pageEls.mkTierMenu, "3").click();
  ok(pageEls.mkGrid.children.length === 1, "empty tier renders one notice");
  ok(pageEls.mkGrid.children[0].classList.contains("mk-empty"), "empty notice class");
  ok(pageEls.mkGrid.children[0].textContent === "No listings in this tier yet.", "empty notice text");
  ok(pageEls.mkCount.textContent === "Showing 0 of 0 listings", "empty count");
  // Switch language the way i18n does (dict swap + event), re-render.
  globalThis.window.symphonyLang = "id";
  doc.fire("symphony-lang-changed");
  ok(pageEls.mkGrid.children[0].textContent === "Belum ada listing pada tier ini.", "id: empty notice translated");
  ok(pageEls.mkCount.textContent === "Menampilkan 0 dari 0 listing", "id: count translated");
  ok(pageEls.mkSoon.textContent === "Market Buka", "id: pill translated");
}

// ---------- 7. i18n completeness for the new keys ----------
{
  makeEnv();
  const NEW_KEYS = ["mk_open", "mk_open_note", "mk_filter_tier", "mk_tier_all",
    "mk_tier_1", "mk_tier_2", "mk_tier_3", "mk_tier_magnum", "mk_sort_asc",
    "mk_sort_desc", "mk_showing", "mk_load_more", "mk_floor", "mk_free_price",
    "mk_buy", "mk_pass", "mk_magnum_card", "mk_badge_magnum", "mk_empty",
    "mk_need_agentid", "mk_approve", "mk_buy_sent", "mk_bought"];
  for (const lang of globalThis.window.SYMPHONY_LANGS) {
    const dict = globalThis.window.I18N[lang];
    for (const k of NEW_KEYS) {
      ok(typeof dict[k] === "string" && dict[k].length > 0 && dict[k] !== k,
        `i18n ${lang} has ${k}`);
    }
  }
}

console.log(`market-test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
