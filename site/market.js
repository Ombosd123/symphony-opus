// market.js — SYMPHONY official market UI (phase 2).
//
// Approved layout (Awa, 27 Nov 2026): a status banner, two dropdown
// controls (tier filter + price sort), a "showing X of Y" count, a
// two-column card grid (NFT artwork on top; Pass number + tier badge,
// price and floor below; Buy button), and load-more paging.
//
// The section stays in its published closed state until BOTH hold:
//   1. MARKET_ADDRESS is filled in config.js (phase-2 deploy,
//      8–10 Dec 2026), and
//   2. the market contract itself reports open — isOpen() is true
//      only after the sale has sold out (totalSold == 5,000) and
//      before the verdict on 30 Dec 2026, 12:00 UTC (SPEC §23).
// Filling the address alone can never open it early, and no listing
// is ever rendered from local or sample data — every card comes
// from Listed events + listings() reads on the live contract.
//
// Locked rules rendered as-is from the contract: Pass floor = 80%
// of paidOf (read per-Pass via floorOf), Magnum freely priced, 5%
// fee from the seller's proceeds to the TreasuryVault, buyers must
// hold an Agent ID (checked again here before a buy is sent).
(function () {
  const CFG = window.SYMPHONY_CONFIG || {};
  const T = (key, vars) => window.t(key, vars);
  const ZERO = "0x0000000000000000000000000000000000000000";
  const deployed = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a !== ZERO;

  const PAGE_SIZE = 16; // approved batch: 12–20 per load
  const KIND_PASS = 1;
  const KIND_MAGNUM = 2;

  // Minimal human-readable ABIs (same pattern as app.js's inline
  // USDT fragment — abi.js is generated for phase 1 and not edited).
  const MARKET_ABI = [
    "function isOpen() view returns (bool)",
    "function listings(uint256) view returns (address seller, uint8 kind, uint256 tokenId, uint256 price, bool active)",
    "function floorOf(uint256) view returns (uint256)",
    "function buy(uint256) external",
    "event Listed(uint256 indexed listingId, address indexed seller, uint8 kind, uint256 tokenId, uint256 price)",
  ];
  const PASS_ABI = ["function tierOf(uint256) view returns (uint8)"];
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
    listings: [], // {id, kind, tokenId, tier, priceWei, floorWei}
    tier: "ALL",
    sort: "asc",
    shown: PAGE_SIZE,
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

  function applyView(listings, tier, sort) {
    const out = listings.filter((l) => {
      if (tier === "ALL") return true;
      if (tier === "MAGNUM") return l.kind === KIND_MAGNUM;
      return l.kind === KIND_PASS && l.tier === Number(tier);
    });
    out.sort((a, b) => {
      const pa = BigInt(a.priceWei);
      const pb = BigInt(b.priceWei);
      if (pa !== pb) return (pa < pb ? -1 : 1) * (sort === "desc" ? -1 : 1);
      return a.id - b.id;
    });
    return out;
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    soon: $("mkSoon"), banner: $("mkBanner"), bannerTitle: $("mkBannerTitle"),
    bannerNote: $("mkBannerNote"), app: $("mkApp"),
    tierBtn: $("mkTierBtn"), tierMenu: $("mkTierMenu"),
    sortBtn: $("mkSortBtn"), sortMenu: $("mkSortMenu"),
    count: $("mkCount"), grid: $("mkGrid"), more: $("mkMore"), status: $("mkStatus"),
  };
  if (!els.tierBtn || !els.grid) return; // market section not on this page

  function clearEl(el) {
    if (!el) return;
    [...el.children].forEach((c) => c.remove());
    el.textContent = "";
  }
  function setStatus(txt) { if (els.status) els.status.textContent = txt; }

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

  function cardFor(l) {
    const isMagnum = l.kind === KIND_MAGNUM;
    const name = isMagnum ? T("mk_magnum_card", { id: l.tokenId }) : T("mk_pass", { id: l.tokenId });
    const badgeText = isMagnum ? T("mk_badge_magnum") : T("mk_tier_" + l.tier);
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
    buy.addEventListener("click", () => doBuy(l.id).catch((e) => {
      const msg = (e && (e.shortMessage || e.message)) || "Transaction failed";
      setStatus(T("w_error", { msg: String(msg).slice(0, 220) }));
    }));
    body.appendChild(buy);
    card.appendChild(body);
    return card;
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

    const view = applyView(state.listings, state.tier, state.sort);
    const visible = view.slice(0, state.shown);
    if (els.count) els.count.textContent = T("mk_showing", { x: visible.length, y: view.length });
    clearEl(els.grid);
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "mk-empty muted";
      empty.textContent = T("mk_empty");
      els.grid.appendChild(empty);
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

  // ---------- on-chain reads ----------
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

  // ---------- wiring ----------
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
  document.addEventListener("symphony-lang-changed", () => render());

  window.SymphonyMarket = {
    PAGE_SIZE,
    applyView,
    fmtUsdt,
    refresh,
    getState: () => ({ ...state }),
    // Render pipeline entry used by refresh() — and by the local
    // harness with sample data (never shipped as live data).
    setListings(listings) {
      state.listings = listings;
      state.open = true;
      state.loaded = true;
      render();
    },
  };

  render();
  refresh();
})();
