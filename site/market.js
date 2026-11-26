// market.js — SYMPHONY official market UI (phase 2).
//
// Approved layout (Awa, 27 Nov 2026): ONE frame for both sides of
// the market — a status banner, a Buy | Sell switch, and UNDER the
// switch the SAME two dropdown controls (tier filter + price sort)
// in both views, a "showing X of Y" count, a two-column card grid
// (NFT artwork on top; token number + tier badge, price and floor
// below), and load-more paging. The tier/sort selection is kept
// when switching views and applies to each view's grid.
//
// Buy view: every active listing on the market contract.
// Sell view: the connected wallet's own assets — its unclaimed
// Passes and Opus Magnum that are not listed yet (price input +
// floor note + "List for sale"), and its active listings (price +
// ON SALE status + "Cancel listing").
//
// The section stays in its published closed state until BOTH hold:
//   1. MARKET_ADDRESS is filled in config.js (phase-2 deploy,
//      8–10 Dec 2026), and
//   2. the market contract itself reports open — isOpen() is true
//      only after the sale has sold out (totalSold == 5,000) and
//      before the verdict on 30 Dec 2026, 12:00 UTC (SPEC §23).
// Filling the address alone can never open it early, and no listing
// or asset is ever rendered from local or sample data — every card
// comes from on-chain reads on the live contracts.
//
// Locked rules rendered as-is from the contracts: Pass floor = 80%
// of paidOf (read per-Pass via floorOf; the UI blocks a below-floor
// price before any signature, and the contract rejects it too),
// Magnum freely priced, 5% fee from the seller's proceeds to the
// TreasuryVault, buyers must hold an Agent ID (checked again here
// before a buy is sent). Listing needs NO ERC-721 approve step:
// SymphonyPass and Soundcheck transfers can only be executed BY
// the bound market itself, and listPass / listMagnum pull the NFT
// into escrow inside the same transaction.
(function () {
  const CFG = window.SYMPHONY_CONFIG || {};
  const T = (key, vars) => window.t(key, vars);
  const ZERO = "0x0000000000000000000000000000000000000000";
  const deployed = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a !== ZERO;

  const PAGE_SIZE = 16; // approved batch: 12–20 per load
  const KIND_PASS = 1;
  const KIND_MAGNUM = 2;
  const BADGE_MAGNUM = 5; // Soundcheck badge type of Opus Magnum

  // Minimal human-readable ABIs (same pattern as app.js's inline
  // USDT fragment — abi.js is generated for phase 1 and not edited).
  const MARKET_ABI = [
    "function isOpen() view returns (bool)",
    "function listings(uint256) view returns (address seller, uint8 kind, uint256 tokenId, uint256 price, bool active)",
    "function floorOf(uint256) view returns (uint256)",
    "function buy(uint256) external",
    "function listPass(uint256,uint256) returns (uint256)",
    "function listMagnum(uint256,uint256) returns (uint256)",
    "function cancel(uint256) external",
    "event Listed(uint256 indexed listingId, address indexed seller, uint8 kind, uint256 tokenId, uint256 price)",
  ];
  const PASS_ABI = [
    "function tierOf(uint256) view returns (uint8)",
    "function ownerOf(uint256) view returns (address)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ];
  const SC_ABI = ["function badgeOf(address,uint8) view returns (uint256)"];
  const REGISTRY_ABI = ["function balanceOf(address) view returns (uint256)"];
  const USDT_ABI = [
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ];

  const TIER_ART = {
    1: "assets/pass-tier1-overture.webp",
    2: "assets/pass-tier2-crescendo.webp",
    3: "assets/pass-tier3-finale.webp",
  };
  const MAGNUM_ART = "assets/opus-magnum.webp";
  const TIER_COLOR = { 1: "#d4af37", 2: "#2dd4bf", 3: "#b48cf2" };
  const MAGNUM_COLOR = "#ffffff";
  const TIER_OPTIONS = [
    { key: "ALL", labelKey: "mk_tier_all" },
    { key: "1", labelKey: "mk_tier_1" },
    { key: "2", labelKey: "mk_tier_2" },
    { key: "3", labelKey: "mk_tier_3" },
    { key: "MAGNUM", labelKey: "mk_tier_magnum" },
  ];
  const SORT_OPTIONS = [
    { key: "asc", labelKey: "mk_sort_asc" },
    { key: "desc", labelKey: "mk_sort_desc" },
  ];

  const state = {
    open: false,
    loaded: false,
    listings: [], // buy view: {id, kind, tokenId, tier, priceWei, floorWei}
    view: "buy", // "buy" | "sell" — one frame, one shared header
    tier: "ALL",
    sort: "asc",
    shown: PAGE_SIZE,
    account: null, // connected wallet (lowercase) for the sell view
    mineLoaded: false,
    mineLoading: false,
    mine: [], // sell view: {kind, tokenId, tier, listed, listingId, priceWei, floorWei, sortWei}
    sellInputs: {}, // "kind:tokenId" -> raw price input, kept across re-renders
  };

  // ---------- pure helpers (covered by market-test.mjs) ----------
  function fmtUsdt(wei) {
    let v;
    try { v = BigInt(wei); } catch (e) { return "—"; }
    const whole = v / 1000000000000000000n;
    let frac = (v % 1000000000000000000n).toString().padStart(18, "0");
    frac = frac.replace(/0+$/, "");
    if (frac.length > 4) frac = frac.slice(0, 4).replace(/0+$/, "");
    return frac ? whole.toString() + "." + frac : whole.toString();
  }

  function tierMatches(item, tier) {
    if (tier === "ALL") return true;
    if (tier === "MAGNUM") return item.kind === KIND_MAGNUM;
    return item.kind === KIND_PASS && item.tier === Number(tier);
  }

  function applyView(listings, tier, sort) {
    const out = listings.filter((l) => tierMatches(l, tier));
    out.sort((a, b) => {
      const pa = BigInt(a.priceWei);
      const pb = BigInt(b.priceWei);
      if (pa !== pb) return (pa < pb ? -1 : 1) * (sort === "desc" ? -1 : 1);
      return a.id - b.id;
    });
    return out;
  }

  function itemKey(it) { return it.kind + ":" + it.tokenId; }

  // Sell view ordering: listed items by their listing price,
  // unlisted ones by their floor value (Magnum unlisted: 0 — it has
  // no floor), following the shared sort dropdown's direction.
  function applySellView(items, tier, sort) {
    const out = items.filter((it) => tierMatches(it, tier));
    out.sort((a, b) => {
      const pa = BigInt(a.sortWei || 0);
      const pb = BigInt(b.sortWei || 0);
      if (pa !== pb) return (pa < pb ? -1 : 1) * (sort === "desc" ? -1 : 1);
      return a.tokenId - b.tokenId;
    });
    return out;
  }

  // "0.95", "1", "1.2" and the Indonesian "0,90" are all accepted;
  // anything else (empty, letters, >18 decimals, a sign) is null.
  function parsePrice(str) {
    if (typeof str !== "string") return null;
    const s = str.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const parts = s.split(".");
    const whole = parts[0];
    const frac = parts[1] || "";
    if (frac.length > 18) return null;
    return BigInt(whole) * 1000000000000000000n + BigInt((frac + "000000000000000000").slice(0, 18));
  }

  // "" = listable; otherwise the reason the UI must block the
  // signature: "invalid" | "zero" | "below_floor".
  function checkPrice(item, wei) {
    if (wei === null || wei === undefined) return "invalid";
    if (wei <= 0n) return "zero";
    if (item.kind === KIND_PASS && item.floorWei !== null && item.floorWei !== undefined
        && wei < BigInt(item.floorWei)) return "below_floor";
    return "";
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    soon: $("mkSoon"), banner: $("mkBanner"), bannerTitle: $("mkBannerTitle"),
    bannerNote: $("mkBannerNote"), app: $("mkApp"),
    tabBuy: $("mkTabBuy"), tabSell: $("mkTabSell"),
    tierBtn: $("mkTierBtn"), tierMenu: $("mkTierMenu"),
    sortBtn: $("mkSortBtn"), sortMenu: $("mkSortMenu"),
    count: $("mkCount"), grid: $("mkGrid"), more: $("mkMore"), status: $("mkStatus"),
    sellNote: $("mkSellNote"),
  };
  if (!els.tierBtn || !els.grid) return; // market section not on this page

  function clearEl(el) {
    if (!el) return;
    [...el.children].forEach((c) => c.remove());
    el.textContent = "";
  }
  function setStatus(txt) { if (els.status) els.status.textContent = txt; }
  function errStatus(e) {
    const msg = (e && (e.shortMessage || e.message)) || "Transaction failed";
    setStatus(T("w_error", { msg: String(msg).slice(0, 220) }));
  }

  function buildMenu(menuEl, options, currentKey, onPick) {
    clearEl(menuEl);
    for (const opt of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-key", opt.key);
      b.textContent = T(opt.labelKey) + (opt.key === currentKey ? " ✓" : "");
      if (opt.key === currentKey) b.classList.add("active");
      b.addEventListener("click", () => { menuEl.hidden = true; onPick(opt.key); });
      menuEl.appendChild(b);
    }
  }

  function cardShell(l, isMagnum, name, badgeText) {
    const card = document.createElement("div");
    card.className = "mk-card" + (isMagnum ? " magnum" : "");
    const img = document.createElement("img");
    img.src = isMagnum ? MAGNUM_ART : TIER_ART[l.tier] || TIER_ART[1];
    img.alt = name;
    card.appendChild(img);
    const body = document.createElement("div");
    body.className = "mk-card-body";
    const titleRow = document.createElement("div");
    titleRow.className = "mk-card-title";
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    const badge = document.createElement("span");
    badge.className = "mk-badge";
    badge.style.background = isMagnum ? MAGNUM_COLOR : TIER_COLOR[l.tier] || TIER_COLOR[1];
    badge.textContent = badgeText;
    titleRow.appendChild(nameEl);
    titleRow.appendChild(badge);
    body.appendChild(titleRow);
    card.appendChild(body);
    return { card, body };
  }

  function cardFor(l) {
    const isMagnum = l.kind === KIND_MAGNUM;
    const name = isMagnum ? T("mk_magnum_card", { id: l.tokenId }) : T("mk_pass", { id: l.tokenId });
    const badgeText = isMagnum ? T("mk_badge_magnum") : T("mk_tier_" + l.tier);
    const { card, body } = cardShell(l, isMagnum, name, badgeText);
    const price = document.createElement("div");
    price.className = "mk-price";
    price.textContent = fmtUsdt(l.priceWei) + " USDT";
    body.appendChild(price);
    const floor = document.createElement("div");
    floor.className = "mk-floor";
    floor.textContent = isMagnum ? T("mk_free_price") : T("mk_floor", { amt: fmtUsdt(l.floorWei) });
    body.appendChild(floor);
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "mk-buy";
    buy.textContent = T("mk_buy");
    buy.addEventListener("click", () => doBuy(l.id).catch(errStatus));
    body.appendChild(buy);
    return card;
  }

  function validateSellInput(it, wrap, input, btn) {
    const raw = input.value || "";
    if (!raw.trim()) { // untouched: neutral — the click guard reports it
      wrap.classList.remove("bad");
      btn.disabled = false;
      return;
    }
    const bad = checkPrice(it, parsePrice(raw)) !== "";
    if (bad) wrap.classList.add("bad"); else wrap.classList.remove("bad");
    btn.disabled = bad;
  }

  function cardForSell(it) {
    const isMagnum = it.kind === KIND_MAGNUM;
    const name = isMagnum ? T("mk_magnum_card", { id: it.tokenId }) : T("mk_pass", { id: it.tokenId });
    const badgeText = isMagnum ? T("mk_badge_magnum") : T("mk_tier_" + it.tier);
    const { card, body } = cardShell(it, isMagnum, name, badgeText);
    card.setAttribute("data-token", itemKey(it));
    if (it.listed) {
      const price = document.createElement("div");
      price.className = "mk-price";
      price.textContent = fmtUsdt(it.priceWei) + " USDT";
      body.appendChild(price);
      const floor = document.createElement("div");
      floor.className = "mk-floor";
      floor.textContent = isMagnum ? T("mk_free_price") : T("mk_floor", { amt: fmtUsdt(it.floorWei) });
      body.appendChild(floor);
      const listed = document.createElement("div");
      listed.className = "mk-listed";
      listed.textContent = "● " + T("mk_listed_badge");
      body.appendChild(listed);
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "mk-cancel";
      cancel.textContent = T("mk_cancel_btn");
      cancel.addEventListener("click", () => doCancel(it).catch(errStatus));
      body.appendChild(cancel);
      return card;
    }
    const wrap = document.createElement("div");
    wrap.className = "mk-price-input";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = T("mk_price_ph");
    input.value = state.sellInputs[itemKey(it)] || "";
    const suffix = document.createElement("span");
    suffix.textContent = "USDT";
    wrap.appendChild(input);
    wrap.appendChild(suffix);
    body.appendChild(wrap);
    const note = document.createElement("div");
    note.className = "mk-floor";
    note.textContent = isMagnum ? T("mk_free_price") : T("mk_floor_min", { amt: fmtUsdt(it.floorWei) });
    body.appendChild(note);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mk-buy";
    btn.textContent = T("mk_list_btn");
    input.addEventListener("input", () => {
      state.sellInputs[itemKey(it)] = input.value;
      validateSellInput(it, wrap, input, btn);
    });
    btn.addEventListener("click", () => doList(it).catch(errStatus));
    validateSellInput(it, wrap, input, btn);
    body.appendChild(btn);
    return card;
  }

  function emptyNote(txt) {
    const note = document.createElement("div");
    note.className = "mk-empty muted";
    note.textContent = txt;
    return note;
  }

  function renderBuy() {
    const view = applyView(state.listings, state.tier, state.sort);
    const visible = view.slice(0, state.shown);
    if (els.count) els.count.textContent = T("mk_showing", { x: visible.length, y: view.length });
    clearEl(els.grid);
    if (!visible.length) {
      els.grid.appendChild(emptyNote(T("mk_empty")));
    } else {
      for (const l of visible) els.grid.appendChild(cardFor(l));
    }
    if (els.more) {
      if (view.length > state.shown) {
        els.more.hidden = false;
        els.more.textContent = T("mk_load_more", { n: view.length - state.shown });
      } else {
        els.more.hidden = true;
      }
    }
  }

  function renderSell() {
    if (!state.account) {
      if (els.count) els.count.textContent = T("mk_showing_sell", { x: 0, y: 0 });
      clearEl(els.grid);
      els.grid.appendChild(emptyNote(T("mk_sell_connect")));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mk-more";
      btn.style.gridColumn = "1 / -1";
      btn.textContent = T("mk_connect_wallet");
      btn.addEventListener("click", () => connectSellWallet().catch(errStatus));
      els.grid.appendChild(btn);
      if (els.more) els.more.hidden = true;
      return;
    }
    if (!state.mineLoaded) {
      if (els.count) els.count.textContent = T("mk_showing_sell", { x: 0, y: 0 });
      clearEl(els.grid);
      els.grid.appendChild(emptyNote(T("mk_sell_loading")));
      if (els.more) els.more.hidden = true;
      loadMine(); // guarded by mineLoading; re-renders when done
      return;
    }
    const view = applySellView(state.mine, state.tier, state.sort);
    const visible = view.slice(0, state.shown);
    if (els.count) els.count.textContent = T("mk_showing_sell", { x: visible.length, y: view.length });
    clearEl(els.grid);
    if (!visible.length) {
      els.grid.appendChild(emptyNote(T("mk_sell_empty")));
    } else {
      for (const it of visible) els.grid.appendChild(cardForSell(it));
    }
    if (els.more) {
      if (view.length > state.shown) {
        els.more.hidden = false;
        els.more.textContent = T("mk_load_more", { n: view.length - state.shown });
      } else {
        els.more.hidden = true;
      }
    }
  }

  function render() {
    // Pill + banner follow the state; the data-i18n key is swapped
    // with the state so applyI18n() on a language change stays right.
    if (els.soon) {
      els.soon.setAttribute("data-i18n", state.open ? "mk_open" : "mk_soon");
      els.soon.textContent = T(state.open ? "mk_open" : "mk_soon");
    }
    if (!state.open) {
      if (els.banner) els.banner.hidden = true;
      if (els.app) els.app.hidden = true;
      return;
    }
    if (els.banner) {
      els.banner.hidden = false;
      if (els.bannerTitle) els.bannerTitle.textContent = "● " + T("mk_open");
      if (els.bannerNote) els.bannerNote.textContent = " " + T("mk_open_note");
    }
    if (els.app) els.app.hidden = false;

    // The shared header: Buy | Sell switch, then the SAME two
    // dropdowns in both views (Awa's correction — one frame, not
    // two separate designs). Tier/sort state is shared, so a pick
    // made in one view is still in force in the other.
    if (els.tabBuy) {
      els.tabBuy.textContent = T("mk_tab_buy");
      if (state.view === "buy") els.tabBuy.classList.add("active");
      else els.tabBuy.classList.remove("active");
    }
    if (els.tabSell) {
      els.tabSell.textContent = T("mk_tab_sell");
      if (state.view === "sell") els.tabSell.classList.add("active");
      else els.tabSell.classList.remove("active");
    }
    const tierLabel = (TIER_OPTIONS.find((o) => o.key === state.tier) || TIER_OPTIONS[0]).labelKey;
    if (els.tierBtn) {
      els.tierBtn.textContent = T("mk_filter_tier") + ": " + T(tierLabel);
      const caret = document.createElement("span");
      caret.className = "mk-caret";
      caret.textContent = "▾";
      els.tierBtn.appendChild(caret);
    }
    const sortLabel = (SORT_OPTIONS.find((o) => o.key === state.sort) || SORT_OPTIONS[0]).labelKey;
    if (els.sortBtn) {
      els.sortBtn.textContent = T(sortLabel);
      const caret = document.createElement("span");
      caret.className = "mk-caret";
      caret.textContent = "▾";
      els.sortBtn.appendChild(caret);
    }
    buildMenu(els.tierMenu, TIER_OPTIONS, state.tier, (key) => {
      state.tier = key; state.shown = PAGE_SIZE; render();
    });
    buildMenu(els.sortMenu, SORT_OPTIONS, state.sort, (key) => {
      state.sort = key; state.shown = PAGE_SIZE; render();
    });

    if (state.view === "sell") renderSell(); else renderBuy();

    if (els.sellNote) {
      const show = state.view === "sell";
      els.sellNote.hidden = !show;
      if (show) els.sellNote.textContent = T("mk_sell_note");
    }
  }

  // ---------- on-chain reads (buy view) ----------
  async function loadListings() {
    const rpc = new ethers.JsonRpcProvider(CFG.READ_RPC);
    const market = new ethers.Contract(CFG.MARKET_ADDRESS, MARKET_ABI, rpc);
    const open = await market.isOpen().catch(() => false);
    state.open = !!open;
    if (!state.open) { render(); return; }
    const head = await rpc.getBlockNumber();
    // Without a recorded deploy block, only the head block is
    // scanned (a just-deployed market has no older listings); the
    // deploy step records MARKET_DEPLOY_BLOCK in config.js.
    const deployBlock = Number(CFG.MARKET_DEPLOY_BLOCK || 0);
    const from = deployBlock > 0 ? deployBlock : head;
    const ids = new Set();
    const CHUNK = 50000;
    for (let start = from; start <= head; start += CHUNK) {
      const end = Math.min(head, start + CHUNK - 1);
      try {
        const evs = await market.queryFilter("Listed", start, end);
        for (const e of evs) ids.add(Number(e.args[0]));
      } catch (e) { /* chunk unavailable on this RPC — skip it */ }
    }
    const pass = deployed(CFG.PASS_ADDRESS)
      ? new ethers.Contract(CFG.PASS_ADDRESS, PASS_ABI, rpc) : null;
    const out = [];
    for (const id of [...ids].sort((a, b) => a - b)) {
      try {
        const l = await market.listings(id);
        if (!l.active) continue;
        const kind = Number(l.kind);
        let tier = 0;
        let floorWei = null;
        if (kind === KIND_PASS) {
          if (pass) tier = Number(await pass.tierOf(l.tokenId));
          floorWei = await market.floorOf(l.tokenId);
        }
        out.push({ id, kind, tokenId: Number(l.tokenId), tier, priceWei: l.price, floorWei });
      } catch (e) { /* listing unreadable — skip it */ }
    }
    state.listings = out;
    state.loaded = true;
    render();
  }

  async function refresh() {
    if (!deployed(CFG.MARKET_ADDRESS) || typeof ethers === "undefined") {
      state.open = false;
      render();
      return;
    }
    try { await loadListings(); }
    catch (e) { state.open = false; render(); /* fail closed */ }
  }

  // ---------- on-chain reads (sell view) ----------
  // The wallet's sellable assets come from three reads:
  //   1. its ACTIVE listings — the same Listed-event scan as the
  //      buy view, filtered to seller == the connected wallet;
  //   2. its unlisted Passes — Pass Transfer events touching the
  //      wallet give the candidate tokenIds (every Pass mint and
  //      every market move is a Transfer; all of them happen after
  //      the phase-2 deploy block, since the sale opens after the
  //      market deploys), and ownerOf() confirms current holding —
  //      a listed Pass is owned by the market, so it can never
  //      appear twice;
  //   3. its Opus Magnum — Soundcheck.badgeOf(wallet, 5); a listed
  //      Magnum reads 0 here (the badge slot moves to the market)
  //      and is already covered by read 1.
  async function loadMine() {
    if (state.mineLoading || !state.account) return;
    if (!deployed(CFG.MARKET_ADDRESS) || typeof ethers === "undefined") return;
    state.mineLoading = true;
    try {
      const acct = state.account;
      const rpc = new ethers.JsonRpcProvider(CFG.READ_RPC);
      const market = new ethers.Contract(CFG.MARKET_ADDRESS, MARKET_ABI, rpc);
      const pass = deployed(CFG.PASS_ADDRESS)
        ? new ethers.Contract(CFG.PASS_ADDRESS, PASS_ABI, rpc) : null;
      const sc = deployed(CFG.SOUNDCHECK_ADDRESS)
        ? new ethers.Contract(CFG.SOUNDCHECK_ADDRESS, SC_ABI, rpc) : null;
      const head = await rpc.getBlockNumber();
      const deployBlock = Number(CFG.MARKET_DEPLOY_BLOCK || 0);
      const from = deployBlock > 0 ? deployBlock : head;
      const CHUNK = 50000;
      const items = [];

      // 1. my active listings
      const listedIds = new Set();
      for (let start = from; start <= head; start += CHUNK) {
        const end = Math.min(head, start + CHUNK - 1);
        try {
          const evs = await market.queryFilter("Listed", start, end);
          for (const e of evs) listedIds.add(Number(e.args[0]));
        } catch (e) { /* chunk unavailable — skip it */ }
      }
      for (const id of [...listedIds].sort((a, b) => a - b)) {
        try {
          const l = await market.listings(id);
          if (!l.active) continue;
          if (String(l.seller).toLowerCase() !== acct) continue;
          const kind = Number(l.kind);
          let tier = 0;
          let floorWei = null;
          if (kind === KIND_PASS) {
            if (pass) tier = Number(await pass.tierOf(l.tokenId));
            floorWei = await market.floorOf(l.tokenId);
          }
          items.push({
            kind, tokenId: Number(l.tokenId), tier, listed: true, listingId: id,
            priceWei: l.price, floorWei, sortWei: l.price,
          });
        } catch (e) { /* listing unreadable — skip it */ }
      }

      // 2. my unlisted Passes
      if (pass) {
        const candidates = new Set();
        for (let start = from; start <= head; start += CHUNK) {
          const end = Math.min(head, start + CHUNK - 1);
          try {
            const evs = await pass.queryFilter("Transfer", start, end);
            for (const e of evs) {
              const f = String(e.args[0]).toLowerCase();
              const t = String(e.args[1]).toLowerCase();
              if (f === acct || t === acct) candidates.add(Number(e.args[2]));
            }
          } catch (e) { /* chunk unavailable — skip it */ }
        }
        for (const tokenId of [...candidates].sort((a, b) => a - b)) {
          try {
            const owner = String(await pass.ownerOf(tokenId)).toLowerCase();
            if (owner !== acct) continue; // sold, claimed (burned) or listed
            const tier = Number(await pass.tierOf(tokenId));
            const floorWei = await market.floorOf(tokenId);
            items.push({
              kind: KIND_PASS, tokenId, tier, listed: false, listingId: 0,
              priceWei: null, floorWei, sortWei: floorWei,
            });
          } catch (e) { /* token unreadable — skip it */ }
        }
      }

      // 3. my Opus Magnum (at most one per wallet, by contract)
      if (sc) {
        try {
          const magnumId = await sc.badgeOf(acct, BADGE_MAGNUM);
          if (magnumId !== 0n) {
            items.push({
              kind: KIND_MAGNUM, tokenId: Number(magnumId), tier: 0, listed: false,
              listingId: 0, priceWei: null, floorWei: null, sortWei: 0n,
            });
          }
        } catch (e) { /* Soundcheck unreadable — no Magnum item */ }
      }

      state.mine = items;
      state.mineLoaded = true;
    } catch (e) {
      state.mine = [];
      state.mineLoaded = true; // fail soft, like the buy view's per-item skips
      errStatus(e);
    }
    state.mineLoading = false;
    render();
  }

  // ---------- wallet ----------
  async function signerOnBsc() {
    if (!window.ethereum) { setStatus(T("w_no_wallet")); return null; }
    let bp = new ethers.BrowserProvider(window.ethereum);
    const net = await bp.getNetwork();
    if (Number(net.chainId) !== CFG.CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CFG.CHAIN_ID.toString(16) }],
        });
        bp = new ethers.BrowserProvider(window.ethereum);
      } catch (e) { setStatus(T("w_switch_chain")); return null; }
    }
    const signer = await bp.getSigner();
    const account = (await signer.getAddress()).toLowerCase();
    return { signer, account };
  }

  async function detectAccount() {
    if (!window.ethereum || typeof window.ethereum.request !== "function") return;
    try {
      const accts = await window.ethereum.request({ method: "eth_accounts" });
      if (accts && accts[0]) {
        const a = String(accts[0]).toLowerCase();
        if (a !== state.account) {
          state.account = a;
          state.mineLoaded = false;
          if (state.open) render();
        }
      }
    } catch (e) { /* silent — the connect button covers it */ }
  }

  async function connectSellWallet() {
    const s = await signerOnBsc();
    if (!s) return;
    state.account = s.account;
    state.mineLoaded = false;
    render();
  }

  // ---------- buy (wallet; only reachable while open) ----------
  async function doBuy(listingId) {
    if (!window.ethereum) { setStatus(T("w_no_wallet")); return; }
    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) return;
    let bp = new ethers.BrowserProvider(window.ethereum);
    const net = await bp.getNetwork();
    if (Number(net.chainId) !== CFG.CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CFG.CHAIN_ID.toString(16) }],
        });
        bp = new ethers.BrowserProvider(window.ethereum);
      } catch (e) { setStatus(T("w_switch_chain")); return; }
    }
    const signer = await bp.getSigner();
    const account = await signer.getAddress();
    const registry = new ethers.Contract(CFG.AGENT_ID_REGISTRY, REGISTRY_ABI, bp);
    if ((await registry.balanceOf(account)) === 0n) {
      setStatus(T("mk_need_agentid"));
      return;
    }
    const price = BigInt(listing.priceWei);
    const usdt = new ethers.Contract(CFG.USDT_ADDRESS, USDT_ABI, signer);
    const allowance = await usdt.allowance(account, CFG.MARKET_ADDRESS);
    if (allowance < price) {
      setStatus(T("mk_approve"));
      const atx = await usdt.approve(CFG.MARKET_ADDRESS, price);
      await atx.wait();
    }
    const market = new ethers.Contract(CFG.MARKET_ADDRESS, MARKET_ABI, signer);
    setStatus(T("mk_buy_sent"));
    const tx = await market.buy(listingId);
    await tx.wait();
    setStatus(T("mk_bought"));
    state.loaded = false;
    await refresh();
  }

  // ---------- sell actions (wallet; only reachable while open) ----------
  async function doList(it) {
    // The floor guard runs FIRST — before any wallet prompt. The
    // contract would reject a below-floor price anyway; the seller
    // hears it here, without signing anything.
    const wei = parsePrice(state.sellInputs[itemKey(it)] || "");
    const verdict = checkPrice(it, wei);
    if (verdict === "invalid") { setStatus(T("mk_err_price_invalid")); return; }
    if (verdict === "zero") { setStatus(T("mk_err_price_zero")); return; }
    if (verdict === "below_floor") {
      setStatus(T("mk_err_below_floor", { amt: fmtUsdt(it.floorWei) }));
      return;
    }
    const s = await signerOnBsc();
    if (!s) return;
    // No ERC-721 approve precedes this call: the NFT contracts'
    // only transfer path requires the caller to BE the bound
    // market, and listPass / listMagnum execute that transfer
    // themselves — one signature moves the NFT into escrow.
    const market = new ethers.Contract(CFG.MARKET_ADDRESS, MARKET_ABI, s.signer);
    setStatus(T("mk_list_sent"));
    const tx = it.kind === KIND_PASS
      ? await market.listPass(it.tokenId, wei)
      : await market.listMagnum(it.tokenId, wei);
    await tx.wait();
    setStatus(T("mk_listed_ok"));
    delete state.sellInputs[itemKey(it)];
    state.mineLoaded = false;
    await refresh();
  }

  async function doCancel(it) {
    const s = await signerOnBsc();
    if (!s) return;
    const market = new ethers.Contract(CFG.MARKET_ADDRESS, MARKET_ABI, s.signer);
    setStatus(T("mk_cancel_sent"));
    const tx = await market.cancel(it.listingId);
    await tx.wait();
    setStatus(T("mk_cancelled_ok"));
    state.mineLoaded = false;
    await refresh();
  }

  // ---------- wiring ----------
  if (els.tabBuy) els.tabBuy.addEventListener("click", () => {
    if (state.view === "buy") return;
    state.view = "buy"; state.shown = PAGE_SIZE; setStatus("");
    render();
  });
  if (els.tabSell) els.tabSell.addEventListener("click", () => {
    if (state.view === "sell") return;
    state.view = "sell"; state.shown = PAGE_SIZE; setStatus("");
    render();
    detectAccount();
  });
  if (els.tierBtn) els.tierBtn.addEventListener("click", () => {
    if (els.tierMenu) els.tierMenu.hidden = !els.tierMenu.hidden;
    if (els.sortMenu) els.sortMenu.hidden = true;
  });
  if (els.sortBtn) els.sortBtn.addEventListener("click", () => {
    if (els.sortMenu) els.sortMenu.hidden = !els.sortMenu.hidden;
    if (els.tierMenu) els.tierMenu.hidden = true;
  });
  if (els.more) els.more.addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    render();
  });
  if (window.ethereum && typeof window.ethereum.on === "function") {
    try {
      window.ethereum.on("accountsChanged", (accts) => {
        const a = accts && accts[0] ? String(accts[0]).toLowerCase() : null;
        if (a !== state.account) {
          state.account = a;
          state.mineLoaded = false;
          if (state.open) render();
        }
      });
    } catch (e) { /* provider without events */ }
  }
  document.addEventListener("symphony-lang-changed", () => render());

  window.SymphonyMarket = {
    PAGE_SIZE,
    applyView,
    applySellView,
    fmtUsdt,
    parsePrice,
    checkPrice,
    refresh,
    getState: () => ({ ...state }),
    // Render pipeline entries used by refresh() — and by the local
    // harness with sample data (never shipped as live data).
    setListings(listings) {
      state.listings = listings;
      state.open = true;
      state.loaded = true;
      render();
    },
    setMine(items, account) {
      state.mine = items;
      state.account = account ? String(account).toLowerCase() : null;
      state.mineLoaded = true;
      state.open = true;
      state.loaded = true;
      render();
    },
    setView(view) {
      state.view = view === "sell" ? "sell" : "buy";
      state.shown = PAGE_SIZE;
      render();
    },
  };

  render();
  refresh();
  detectAccount();
})();
