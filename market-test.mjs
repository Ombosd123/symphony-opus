// market-test.mjs — SYMPHONY market section harness (Node, stubbed
// DOM / localStorage). Covers: the closed state that ships today
// (no MARKET_ADDRESS in config → banner + app hidden, pill stays
// "Coming Soon"), the pure filter/sort helpers, and — fed with
// LOCAL sample listings through SymphonyMarket.setListings, the
// same render pipeline refresh() uses — the open state: banner,
// "showing X of Y" count, load-more paging (16 per batch), the tier
// dropdown (one tier shows only its own listings), the price-sort
// dropdown, Magnum free-price floor line, the empty-tier state, and
// re-rendering in another language. Package 2 adds the unified
// Buy | Sell frame: the switch itself, the SAME tier/sort dropdowns
// working in the Sell view, listed vs unlisted sell cards, the UI
// floor guard (a below-floor price is blocked before any wallet
// interaction), the no-wallet connect prompt, filter/sort choices
// persisting across views, and sell-view paging — sample assets
// are fed through SymphonyMarket.setMine. Sample data lives ONLY
// in this file; nothing sample is shipped to the live site.
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
  "mkTabBuy", "mkTabSell",
  "mkTierBtn", "mkTierMenu", "mkSortBtn", "mkSortMenu", "mkCount", "mkGrid",
  "mkMore", "mkStatus", "mkSellNote"];

function makeEnv() {
  allEls = [];
  const pageEls = {};
  for (const id of MK_IDS) pageEls[id] = makeEl("div");
  pageEls.mkBanner.hidden = true;
  pageEls.mkApp.hidden = true;
  pageEls.mkTierMenu.hidden = true;
  pageEls.mkSortMenu.hidden = true;
  pageEls.mkMore.hidden = true;
  pageEls.mkSellNote.hidden = true;
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

// Sell-view sample assets for one wallet: unlisted Passes (floor =
// 80% of the tier price), one listed Pass, one unlisted Magnum and
// one listed Magnum. sortWei mirrors market.js: listing price when
// listed, floor value when not (0 for an unlisted Magnum).
const FLOOR = [0, 0.8, 1.2, 1.6];
function sampleMine() {
  const passU = (tokenId, tier) => ({
    kind: 1, tokenId, tier, listed: false, listingId: 0,
    priceWei: null, floorWei: E18(FLOOR[tier]), sortWei: E18(FLOOR[tier]),
  });
  const passL = (tokenId, tier, price, listingId) => ({
    kind: 1, tokenId, tier, listed: true, listingId,
    priceWei: E18(price), floorWei: E18(FLOOR[tier]), sortWei: E18(price),
  });
  return [
    passU(1234, 1),
    passL(876, 2, 1.5, 41),
    passU(3321, 3),
    { kind: 2, tokenId: 3, tier: 0, listed: false, listingId: 0, priceWei: null, floorWei: null, sortWei: 0n },
    passU(55, 1),
    { kind: 2, tokenId: 9, tier: 0, listed: true, listingId: 42, priceWei: E18(30), floorWei: null, sortWei: E18(30) },
  ];
}
function sampleMineBig() {
  const out = [];
  for (let i = 0; i < 20; i++) {
    out.push({
      kind: 1, tokenId: 2001 + i, tier: 1, listed: false, listingId: 0,
      priceWei: null, floorWei: E18(0.8), sortWei: E18(0.8),
    });
  }
  return out;
}
const sellCard = (grid, key) => grid.children.find((c) => c.getAttribute("data-token") === key);
const sellInput = (card) => card.children[1].children[1].children[0];
const sellInputWrap = (card) => card.children[1].children[1];
const sellFloorNote = (card) => card.children[1].children[2].textContent;
const sellListBtn = (card) => card.children[1].children[3];
const listedPrice = (card) => card.children[1].children[1].textContent;
const listedStatus = (card) => card.children[1].children[3].textContent;
const listedCancelBtn = (card) => card.children[1].children[4];

// ---------- 1. closed state (what ships today) ----------
{
  const { pageEls, market } = makeEnv();
  ok(market, "SymphonyMarket exposed");
  ok(pageEls.mkApp.hidden === true, "closed → market app hidden");
  ok(pageEls.mkBanner.hidden === true, "closed → banner hidden");
  ok(pageEls.mkSoon.textContent === "Coming Soon", "closed → pill shows Coming Soon");
  ok(pageEls.mkSoon.getAttribute("data-i18n") === "mk_soon", "closed → pill key mk_soon");
  ok(pageEls.mkGrid.children.length === 0, "closed → no cards rendered");
  ok(pageEls.mkSellNote.hidden === true, "closed → sell note hidden");
  ok(market.getState().view === "buy", "closed → default view is buy");
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

// ---------- 7. pure sell helpers: price parsing + floor guard ----------
{
  const { market } = makeEnv();
  ok(market.parsePrice("0.95") === E18(0.95), "parsePrice 0.95");
  ok(market.parsePrice("0,90") === E18(0.9), "parsePrice Indonesian comma 0,90");
  ok(market.parsePrice("2") === E18(2), "parsePrice integer");
  ok(market.parsePrice(" 1.2 ") === E18(1.2), "parsePrice trims spaces");
  ok(market.parsePrice("") === null, "parsePrice empty → null");
  ok(market.parsePrice("abc") === null, "parsePrice letters → null");
  ok(market.parsePrice("-1") === null, "parsePrice negative → null");
  ok(market.parsePrice("1.1234567890123456789") === null, "parsePrice >18 decimals → null");
  ok(market.parsePrice("0") === 0n, "parsePrice 0 → 0n");
  const t1 = { kind: 1, floorWei: E18(0.8) };
  const mag = { kind: 2, floorWei: null };
  ok(market.checkPrice(t1, E18(0.8)) === "", "checkPrice at floor ok");
  ok(market.checkPrice(t1, E18(0.95)) === "", "checkPrice above floor ok");
  ok(market.checkPrice(t1, E18(0.5)) === "below_floor", "checkPrice below floor blocked");
  ok(market.checkPrice(t1, 0n) === "zero", "checkPrice zero");
  ok(market.checkPrice(t1, null) === "invalid", "checkPrice invalid");
  ok(market.checkPrice(mag, E18(0.01)) === "", "checkPrice Magnum any positive ok");
  ok(market.checkPrice(mag, 0n) === "zero", "checkPrice Magnum zero blocked");
  const mine = sampleMine();
  const asc = market.applySellView(mine, "ALL", "asc");
  ok(asc.map((i) => i.tokenId).join(",") === "3,55,1234,876,3321,9",
    "applySellView asc: by floor/listing value, tokenId tie-break");
  const desc = market.applySellView(mine, "ALL", "desc");
  ok(desc[0].tokenId === 9 && desc[desc.length - 1].tokenId === 3, "applySellView desc");
  ok(market.applySellView(mine, "1", "asc").every((i) => i.kind === 1 && i.tier === 1),
    "applySellView tier 1 only");
  ok(market.applySellView(mine, "1", "asc").length === 2, "applySellView tier 1 count 2");
  ok(market.applySellView(mine, "MAGNUM", "asc").length === 2, "applySellView Magnum count 2");
}

// ---------- 8. the switch + sell view rendering ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  market.setMine(sampleMine(), "0xABC0000000000000000000000000000000000001");
  ok(pageEls.mkTabBuy.textContent === "Buy", "tab label Buy");
  ok(pageEls.mkTabSell.textContent === "Sell", "tab label Sell");
  ok(pageEls.mkTabBuy.classList.contains("active"), "buy tab active by default");
  ok(!pageEls.mkTabSell.classList.contains("active"), "sell tab inactive by default");
  ok(pageEls.mkSellNote.hidden === true, "sell note hidden in buy view");
  pageEls.mkTabSell.click();
  ok(market.getState().view === "sell", "switch → sell view");
  ok(pageEls.mkTabSell.classList.contains("active"), "sell tab active after switch");
  ok(!pageEls.mkTabBuy.classList.contains("active"), "buy tab inactive after switch");
  ok(pageEls.mkCount.textContent === "Showing 6 of 6 of your assets", "sell count line");
  ok(pageEls.mkGrid.children.length === 6, "sell grid renders 6 cards");
  ok(pageEls.mkSellNote.hidden === false, "sell note visible in sell view");
  ok(pageEls.mkSellNote.textContent.includes("escrow"), "sell note explains escrow");
  // First card ascending: the unlisted Magnum (sort value 0).
  const mag = sellCard(pageEls.mkGrid, "2:3");
  ok(!!mag, "unlisted Magnum card present");
  ok(sellFloorNote(mag) === "Free price — no floor", "unlisted Magnum: free price note");
  ok(sellListBtn(mag).textContent === "List for sale", "unlisted Magnum: list button");
  // The listed Pass: price + ON SALE status + cancel button.
  const listed = sellCard(pageEls.mkGrid, "1:876");
  ok(!!listed, "listed Pass card present");
  ok(listedPrice(listed) === "1.5 USDT", "listed Pass shows its price");
  ok(cardFloor(listed) === "Floor: 1.2 USDT", "listed Pass shows its floor");
  ok(listedStatus(listed) === "● ON SALE", "listed Pass shows ON SALE status");
  ok(listedCancelBtn(listed).textContent === "Cancel listing", "listed Pass: cancel button");
  // An unlisted Pass: price input + minimum floor note.
  const un = sellCard(pageEls.mkGrid, "1:1234");
  ok(!!un, "unlisted Pass card present");
  ok(sellFloorNote(un) === "Min. 0.8 USDT (80% floor)", "unlisted Pass: min floor note");
  ok(sellListBtn(un).textContent === "List for sale", "unlisted Pass: list button");
  ok(sellInput(un).placeholder === "Price", "unlisted Pass: price input placeholder");
  // The SAME dropdowns exist and work in the sell view.
  ok(pageEls.mkTierBtn.textContent.includes("Tier:"), "sell view keeps the tier dropdown");
  pageEls.mkTierBtn.click();
  ok(pageEls.mkTierMenu.hidden === false, "sell view: tier menu opens");
  menuItem(pageEls.mkTierMenu, "1").click();
  ok(pageEls.mkGrid.children.length === 2, "sell view tier filter: 2 Overture assets");
  ok(pageEls.mkGrid.children.every((c) => cardBadge(c) === "Overture"), "sell view tier filter: badges");
  ok(pageEls.mkCount.textContent === "Showing 2 of 2 of your assets", "sell count under filter");
  pageEls.mkTierBtn.click();
  menuItem(pageEls.mkTierMenu, "MAGNUM").click();
  ok(pageEls.mkGrid.children.length === 2, "sell view Magnum filter: 2 cards");
  // Switching back restores the buy grid under the same frame.
  pageEls.mkTabBuy.click();
  ok(market.getState().view === "buy", "switch back → buy view");
  ok(pageEls.mkSellNote.hidden === true, "sell note hidden again in buy view");
}

// ---------- 9. the UI floor guard ----------
{
  const { pageEls, market } = makeEnv();
  market.setMine(sampleMine(), "0xabc0000000000000000000000000000000000001");
  market.setView("sell");
  const card = sellCard(pageEls.mkGrid, "1:1234");
  const input = sellInput(card);
  const btn = sellListBtn(card);
  input.value = "0.5";
  input.fire("input");
  ok(btn.disabled === true, "below-floor input disables the list button");
  ok(sellInputWrap(card).classList.contains("bad"), "below-floor input marked bad");
  btn.click(); // stub fires even when disabled — the JS guard must stop it
  ok(pageEls.mkStatus.textContent ===
    "That price is below this Pass's floor (min. 0.8 USDT) — the market would reject it.",
    "click guard: below-floor blocked before any wallet step");
  input.value = "0.8";
  input.fire("input");
  ok(btn.disabled === false, "at-floor input re-enables the button");
  ok(!sellInputWrap(card).classList.contains("bad"), "at-floor input not marked bad");
  input.value = "0.9";
  input.fire("input");
  btn.click();
  ok(pageEls.mkStatus.textContent.startsWith("No wallet found"),
    "valid price passes the guard and reaches the wallet step");
  const mag = sellCard(pageEls.mkGrid, "2:3");
  const magInput = sellInput(mag);
  magInput.value = "0";
  magInput.fire("input");
  ok(sellListBtn(mag).disabled === true, "Magnum zero price disables the button");
  sellListBtn(mag).click();
  ok(pageEls.mkStatus.textContent === "The price must be above 0 USDT.",
    "click guard: zero price blocked");
  const t3 = sellCard(pageEls.mkGrid, "1:3321");
  sellListBtn(t3).click();
  ok(pageEls.mkStatus.textContent === "Enter a valid price in USDT.",
    "click guard: empty price blocked");
}

// ---------- 10. filter/sort choices persist across the switch ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  market.setMine(sampleMine(), "0xabc0000000000000000000000000000000000001");
  pageEls.mkSortBtn.click();
  menuItem(pageEls.mkSortMenu, "desc").click();
  ok(cardPrice(pageEls.mkGrid.children[0]) === "40 USDT", "buy view desc: priciest first");
  pageEls.mkTabSell.click();
  ok(pageEls.mkSortBtn.textContent.includes("Price: high → low"), "sort choice kept in sell view");
  ok(sellCard(pageEls.mkGrid, "2:9") === pageEls.mkGrid.children[0],
    "sell view desc: priciest own asset first");
  pageEls.mkTierBtn.click();
  menuItem(pageEls.mkTierMenu, "2").click();
  ok(pageEls.mkGrid.children.length === 1, "sell view tier 2: only the listed Crescendo");
  pageEls.mkTabBuy.click();
  ok(pageEls.mkGrid.children.length === 5, "tier choice kept back in buy view");
  ok(pageEls.mkCount.textContent === "Showing 5 of 5 listings", "buy count under kept filter");
}

// ---------- 11. sell view load-more paging ----------
{
  const { pageEls, market } = makeEnv();
  market.setMine(sampleMineBig(), "0xabc0000000000000000000000000000000000001");
  market.setView("sell");
  ok(pageEls.mkGrid.children.length === 16, "sell first batch renders 16 cards");
  ok(pageEls.mkCount.textContent === "Showing 16 of 20 of your assets", "sell count first batch");
  ok(pageEls.mkMore.hidden === false, "sell load-more visible");
  pageEls.mkMore.click();
  ok(pageEls.mkGrid.children.length === 20, "sell load-more renders the rest");
  ok(pageEls.mkMore.hidden === true, "sell load-more hides when exhausted");
}

// ---------- 12. sell view without a wallet ----------
{
  const { pageEls, market } = makeEnv();
  market.setListings(sampleListings());
  pageEls.mkTabSell.click();
  ok(pageEls.mkCount.textContent === "Showing 0 of 0 of your assets", "no wallet: zero count");
  ok(pageEls.mkGrid.children.length === 2, "no wallet: prompt + connect button");
  ok(pageEls.mkGrid.children[0].textContent.includes("Connect your wallet"),
    "no wallet: connect prompt text");
  ok(pageEls.mkGrid.children[1].textContent === "Connect wallet", "no wallet: connect button");
  ok(pageEls.mkSellNote.hidden === false, "no wallet: sell note still visible");
  pageEls.mkGrid.children[1].click();
  ok(pageEls.mkStatus.textContent.startsWith("No wallet found"),
    "connect click without a wallet reports it");
}

// ---------- 13. sell view re-renders in Indonesian ----------
{
  const { doc, pageEls, market } = makeEnv();
  market.setMine(sampleMine(), "0xabc0000000000000000000000000000000000001");
  market.setView("sell");
  globalThis.window.symphonyLang = "id";
  doc.fire("symphony-lang-changed");
  ok(pageEls.mkTabBuy.textContent === "Beli", "id: tab Beli");
  ok(pageEls.mkTabSell.textContent === "Jual", "id: tab Jual");
  ok(pageEls.mkCount.textContent === "Menampilkan 6 dari 6 aset kamu", "id: sell count");
  const listed = sellCard(pageEls.mkGrid, "1:876");
  ok(listedStatus(listed) === "● SEDANG DIJUAL", "id: listed status SEDANG DIJUAL");
  ok(listedCancelBtn(listed).textContent === "Batalkan Listing", "id: cancel button");
  const un = sellCard(pageEls.mkGrid, "1:1234");
  ok(sellListBtn(un).textContent === "Pasang Listing", "id: list button Pasang Listing");
  ok(sellFloorNote(un) === "Min. 0.8 USDT (lantai 80%)", "id: min floor note");
  ok(pageEls.mkSellNote.textContent.includes("escrow market"), "id: sell note");
}

// ---------- 14. i18n completeness for the new keys ----------
{
  makeEnv();
  const NEW_KEYS = ["mk_open", "mk_open_note", "mk_filter_tier", "mk_tier_all",
    "mk_tier_1", "mk_tier_2", "mk_tier_3", "mk_tier_magnum", "mk_sort_asc",
    "mk_sort_desc", "mk_showing", "mk_load_more", "mk_floor", "mk_free_price",
    "mk_buy", "mk_pass", "mk_magnum_card", "mk_badge_magnum", "mk_empty",
    "mk_need_agentid", "mk_approve", "mk_buy_sent", "mk_bought",
    "mk_tab_buy", "mk_tab_sell", "mk_showing_sell", "mk_sell_connect",
    "mk_connect_wallet", "mk_sell_loading", "mk_sell_empty", "mk_price_ph",
    "mk_floor_min", "mk_list_btn", "mk_listed_badge", "mk_cancel_btn",
    "mk_sell_note", "mk_err_price_invalid", "mk_err_price_zero",
    "mk_err_below_floor", "mk_list_sent", "mk_listed_ok", "mk_cancel_sent",
    "mk_cancelled_ok"];
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
