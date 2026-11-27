// profile.js — SYMPHONY "My Profile" page.
// Read-only: every value comes from public contract views over the
// read RPC. The visitor's wallet is used only to learn its address —
// this page never asks for a signature or a transaction.
(function () {
  const CFG = window.SYMPHONY_CONFIG || {};
  const ABI = window.SYMPHONY_ABI || {};
  const T = (key, vars) => (window.t ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const BADGE_NAMES = ["—", "FIRST NOTE", "TUNING", "REHEARSAL", "FULL SCORE"];
  const BADGE_DAYS = [0, 1, 3, 7, 14];
  const BADGE_IMGS = ["",
    "assets/badge-first-note.webp", "assets/badge-tuning.webp",
    "assets/badge-rehearsal.webp", "assets/badge-full-score.webp"];
  const ERC20_BAL = ["function balanceOf(address) view returns (uint256)"];
  const PRESALE_VIEWS = [
    "function contributionOf(address) view returns (uint256)",
    "function opusOwedOf(address) view returns (uint256)",
  ];
  const SALE_VIEWS = ["function primaryPurchases(address) view returns (uint256)"];

  let account = null;
  let provider = null;
  let lastData = null; // cached reads, re-rendered on language change

  function readProvider() {
    if (!provider) provider = new ethers.JsonRpcProvider(CFG.READ_RPC);
    return provider;
  }
  function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function fmt18(v) {
    const s = ethers.formatUnits(v, 18);
    return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
  }
  function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
  function show(id, on) { const el = $(id); if (el) el.hidden = !on; }

  async function connect() {
    if (!window.ethereum) { setText("profNote", T("prof_connect_note")); return; }
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accs && accs.length) { account = accs[0]; await load(); }
    } catch (e) { /* user declined — the note stays */ }
  }

  async function load() {
    if (!account) {
      setText("profNote", T("prof_connect_note"));
      show("profAddrRow", false); show("profGrid", false); show("profBadgesWrap", false);
      return;
    }
    setText("profNote", T("prof_loading"));
    show("profAddrRow", true);
    setText("profAddr", shortAddr(account));
    const p = readProvider();
    const d = { badges: [false], magnum: false };
    try {
      const prelude = new ethers.Contract(CFG.PRELUDE_ADDRESS, ABI.PreludeRegistry, p);
      d.registered = await prelude.isRegistered(account);
      d.hasPass = await prelude.hasPass(account);
      if (d.registered) {
        try { d.passNo = Number(await prelude.passOf(account)); } catch (e) { d.passNo = 0; }
        try { d.refs = Number(await prelude.referralCount(account)); } catch (e) { d.refs = null; }
      }
    } catch (e) { d.registered = false; d.hasPass = false; }
    try {
      const sc = new ethers.Contract(CFG.SOUNDCHECK_ADDRESS, ABI.Soundcheck, p);
      d.total = Number(await sc.totalCheckInsOf(account));
      d.streak = Number(await sc.streakOf(account));
      const lastDay = Number(await sc.lastCheckInDayOf(account));
      const today = Math.floor(Date.now() / 1000 / 86400);
      d.checkedToday = lastDay === today && d.total > 0;
      for (let t = 1; t <= 4; t++) d.badges.push((await sc.badgeOf(account, t)) !== 0n);
      d.magnum = await sc.hasMagnum(account);
    } catch (e) { d.total = 0; d.streak = 0; d.checkedToday = false; }
    // Phase 2 holdings — each row appears only when its contract
    // address is configured (filled in config.js after the deploy).
    d.sale = {};
    try {
      if (CFG.PASS_ADDRESS) {
        const pass = new ethers.Contract(CFG.PASS_ADDRESS, ERC20_BAL, p);
        d.sale.passHeld = Number(await pass.balanceOf(account));
      }
      if (CFG.SALE_ADDRESS) {
        const sale = new ethers.Contract(CFG.SALE_ADDRESS, SALE_VIEWS, p);
        d.sale.primary = Number(await sale.primaryPurchases(account));
      }
      if (CFG.VERS_ADDRESS) {
        const vers = new ethers.Contract(CFG.VERS_ADDRESS, ERC20_BAL, p);
        d.sale.vers = fmt18(await vers.balanceOf(account));
      }
      if (CFG.REST_ADDRESS) {
        const rest = new ethers.Contract(CFG.REST_ADDRESS, ERC20_BAL, p);
        d.sale.rest = fmt18(await rest.balanceOf(account));
      }
      if (CFG.PRESALE_ADDRESS) {
        const pre = new ethers.Contract(CFG.PRESALE_ADDRESS, PRESALE_VIEWS, p);
        d.sale.preContrib = fmt18(await pre.contributionOf(account));
        d.sale.preOwed = fmt18(await pre.opusOwedOf(account));
      }
    } catch (e) { /* a failing phase-2 read hides its row, never the page */ }
    lastData = d;
    setText("profNote", "");
    render();
  }

  function render() {
    const d = lastData;
    if (!d) return;
    show("profGrid", true);
    // Prelude
    if (!d.registered) setText("profPreludeLine", T("prof_reg_no"));
    else if (d.hasPass) setText("profPreludeLine", T("prof_reg_yes", { n: d.passNo || "?" }));
    else setText("profPreludeLine", T("prof_reg_held_no"));
    setText("profRefLine", d.registered && d.refs !== null && d.refs !== undefined
      ? T("prof_refs", { n: d.refs }) : "");
    // Soundcheck
    setText("profTotal", String(d.total));
    setText("profStreak", String(d.streak));
    setText("profToday", d.checkedToday ? T("prof_today_done") : T("prof_today_pending"));
    let nextTxt = "";
    for (let t = 1; t <= 4; t++) {
      if (!d.badges[t]) { nextTxt = T("prof_next", { name: BADGE_NAMES[t], d: BADGE_DAYS[t] }); break; }
    }
    setText("profNext", nextTxt);
    // Badges
    const wrap = $("profBadges");
    if (wrap) {
      wrap.innerHTML = "";
      for (let t = 1; t <= 4; t++) {
        const fig = document.createElement("figure");
        fig.className = d.badges[t] ? "earned" : "locked";
        const img = document.createElement("img");
        img.src = BADGE_IMGS[t]; img.alt = BADGE_NAMES[t];
        const cap = document.createElement("figcaption");
        cap.textContent = BADGE_NAMES[t];
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = d.badges[t] ? T("prof_earned") : T("prof_day", { d: BADGE_DAYS[t] });
        cap.appendChild(tag);
        fig.appendChild(img); fig.appendChild(cap);
        wrap.appendChild(fig);
      }
      const fig = document.createElement("figure");
      fig.className = d.magnum ? "earned" : "locked";
      const img = document.createElement("img");
      img.src = "assets/opus-magnum.webp"; img.alt = "OPUS MAGNUM";
      const cap = document.createElement("figcaption");
      cap.textContent = "OPUS MAGNUM";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = d.magnum ? T("prof_earned") : T("prof_magnum_req");
      cap.appendChild(tag);
      fig.appendChild(img); fig.appendChild(cap);
      wrap.appendChild(fig);
    }
    show("profBadgesWrap", true);
    // Sale & holdings
    const s = d.sale || {};
    const anySale = ["passHeld", "primary", "vers", "rest", "preContrib", "preOwed"]
      .some((k) => s[k] !== undefined);
    show("profSaleSoon", !anySale);
    show("profSaleRows", anySale);
    const row = (rowId, valId, val) => {
      show(rowId, val !== undefined);
      if (val !== undefined) setText(valId, String(val));
    };
    row("rowPassHeld", "profPassHeld", s.passHeld);
    row("rowPrimary", "profPrimary", s.primary);
    row("rowVers", "profVers", s.vers);
    row("rowRest", "profRest", s.rest);
    row("rowPreContrib", "profPreContrib", s.preContrib);
    row("rowPreOwed", "profPreOwed", s.preOwed);
  }

  const btn = $("profConnectBtn");
  if (btn) btn.addEventListener("click", connect);
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", (accs) => {
      account = accs && accs.length ? accs[0] : null;
      lastData = null;
      load();
    });
  }
  document.addEventListener("symphony-lang-changed", () => { if (lastData) render(); else if (!account) setText("profNote", T("prof_connect_note")); });
  // Silent reconnect when a wallet is already connected to this site.
  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" })
      .then((accs) => { if (accs && accs.length) { account = accs[0]; load(); } else setText("profNote", T("prof_connect_note")); })
      .catch(() => setText("profNote", T("prof_connect_note")));
  } else {
    setText("profNote", T("prof_connect_note"));
  }
})();
