// app.js — SYMPHONY phase-1 site logic.
// Reads public counters without a wallet; wallet actions (register,
// check-in, streak repair) run through the visitor's own wallet.
// All user-facing strings come from the static i18n dictionary
// (i18n.js) in the visitor's chosen language. If contract addresses
// are not filled in config.js yet, the site stays in info-only mode
// and every on-chain value shows "—".
const CFG = window.SYMPHONY_CONFIG;
const ABI = window.SYMPHONY_ABI;
const T = (key, vars) => window.t(key, vars);
const ZERO = "0x0000000000000000000000000000000000000000";
const deployed = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a !== ZERO;

const $ = (id) => document.getElementById(id);
function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

// ---------- phase-1 referral: ?ref=<address> ----------
// A visitor arriving with a valid ?ref= registers through
// registerRef(that address); an invalid or zero ref falls back to
// plain register(). The contract itself enforces the rest (the
// referrer must already hold a Prelude Pass; no self-referral) and
// its reverts surface through the normal error path.
const REF_PARAM = (() => {
  try {
    const r = new URLSearchParams(location.search).get("ref");
    if (r && typeof ethers !== "undefined" && ethers.isAddress(r) && r.toLowerCase() !== ZERO) return r;
  } catch (e) { /* malformed URL — no referral */ }
  return null;
})();
function updateRefNote(registered) {
  const el = $("refArriveNote");
  if (!el) return;
  el.textContent = REF_PARAM && !registered ? T("ref_arrive") : "";
}

// ---------- countdown to sale open (numbers & date always UTC) ----------
function tickCountdown() {
  const el = $("countdown");
  if (!el) return;
  const now = Math.floor(Date.now() / 1000);
  const diff = CFG.SALE_OPEN_TS - now;
  if (diff <= 0) {
    el.textContent = T("dyn_countdown_open");
    return;
  }
  el.textContent = T("dyn_countdown", {
    d: Math.floor(diff / 86400),
    h: Math.floor((diff % 86400) / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  });
}
setInterval(tickCountdown, 1000);
tickCountdown();
document.addEventListener("symphony-lang-changed", () => {
  tickCountdown();
  refreshPublic();
  if (account) refreshMine();
  else updateRefNote(false);
});

// ---------- score chart (registrations beyond the 500 gate) ----------
// The chart exists only once registration #501 has landed: below
// that, the section stays hidden. Daily buckets come from
// score-data.json, a static file rebuilt from Registered events by
// an off-site job; counting starts at registration #501, each day is
// one note (height = that day's joins, scaled to the biggest day),
// and the only number printed per day is the running total (#cum).
const SCORE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
async function renderScoreChart(n) {
  const wrap = $("scoreChart");
  if (!wrap) return;
  if (n < CFG.PRELUDE_GATE + 1) { wrap.hidden = true; return; }
  try {
    const res = await fetch("score-data.json", { cache: "no-store" });
    if (!res.ok) { wrap.hidden = true; return; }
    const data = await res.json();
    const days = (data.days || []).filter((d) => d.cum >= CFG.PRELUDE_GATE + 1 && d.joins > 0);
    if (!days.length) { wrap.hidden = true; return; }
    const max = Math.max(...days.map((d) => d.joins), 1);
    const staff = $("scoreStaff");
    const labels = $("scoreLabels");
    if (!staff || !labels) { wrap.hidden = true; return; }
    staff.querySelectorAll(".score-note, .score-tag").forEach((e) => e.remove());
    labels.innerHTML = "";
    let peakTagged = false;
    days.forEach((d, i) => {
      const x = ((i + 0.5) / days.length) * 100;
      const isPeak = d.joins === max;
      const note = document.createElement("div");
      note.className = "score-note" + (isPeak ? " peak" : "");
      note.style.left = x + "%";
      note.style.bottom = (8 + (d.joins / max) * 76) + "%";
      staff.appendChild(note);
      if (isPeak && !peakTagged) {
        peakTagged = true;
        const tag = document.createElement("div");
        tag.className = "score-tag";
        tag.textContent = T("score_peak");
        tag.style.left = x + "%";
        tag.style.bottom = (8 + (d.joins / max) * 76 + 9) + "%";
        staff.appendChild(tag);
      }
      const cell = document.createElement("div");
      const parts = String(d.d).split("-");
      const label = parts.length === 3 ? Number(parts[2]) + " " + SCORE_MONTHS[Number(parts[1]) - 1] : String(d.d);
      cell.innerHTML = label + "<br><strong>#" + d.cum + "</strong>";
      labels.appendChild(cell);
    });
    setText("scoreLatest", T("score_latest", { n: days[days.length - 1].cum }));
    wrap.hidden = false;
  } catch (e) {
    wrap.hidden = true;
  }
}

// ---------- public reads (no wallet) ----------
async function refreshPublic() {
  if (!deployed(CFG.PRELUDE_ADDRESS) || typeof ethers === "undefined") return;
  try {
    const rpc = new ethers.JsonRpcProvider(CFG.READ_RPC);
    const prelude = new ethers.Contract(CFG.PRELUDE_ADDRESS, ABI.PreludeRegistry, rpc);
    const n = Number(await prelude.count());
    setText("preludeCount", String(n));
    setText("preludeCountPresale", String(n));
    const pct = Math.min(100, (n / CFG.PRELUDE_GATE) * 100);
    for (const id of ["gateBar", "gateBarPresale"]) {
      const bar = $(id);
      if (bar) bar.style.width = pct.toFixed(1) + "%";
    }
    setText("gateNote", n >= CFG.PRELUDE_GATE
      ? T("gate_reached")
      : T("gate_remaining", { n: CFG.PRELUDE_GATE - n }));
    renderScoreChart(n);
    // Your Melody: newest registrants = highest tokenIds (issued in
    // registration order). Passes are soulbound, so ownerOf(tokenId)
    // is the registrant; burned passes revert and are skipped. With
    // no registrations yet the provider stays null and the button
    // remains hidden (graceful degradation before launch).
    if (window.SymphonyMelody) window.SymphonyMelody.setLatestProvider(n > 0 ? async () => {
      const addrs = [];
      for (let tid = n; tid >= Math.max(1, n - 9); tid--) {
        try { addrs.push(await prelude.ownerOf(tid)); } catch (e) { /* burned — skip */ }
      }
      return addrs;
    } : null);
  } catch (e) {
    /* read RPC unavailable — counters stay at — */
  }
}

// ---------- wallet ----------
let provider = null;
let signer = null;
let account = null;

async function connect() {
  if (!window.ethereum) {
    setText("walletStatus", T("w_no_wallet"));
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CFG.CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CFG.CHAIN_ID.toString(16) }],
      });
      provider = new ethers.BrowserProvider(window.ethereum);
    } catch (e) {
      setText("walletStatus", T("w_switch_chain"));
      return;
    }
  }
  signer = await provider.getSigner();
  account = await signer.getAddress();
  setText("walletStatus", T("w_connected", { addr: account }));
  if (window.SymphonyMelody) window.SymphonyMelody.setAccount(account);
  await refreshMine();
}

const BADGE_NAMES = ["—", "FIRST NOTE", "TUNING", "REHEARSAL", "FULL SCORE"];

// Snapshot of which Soundcheck NFTs an address currently holds,
// using only the views refreshMine() already reads (badgeOf per
// tier + hasMagnum). Comparing a snapshot taken before a check-in
// with one taken after it is how the site knows exactly which badge
// THAT check-in minted — the streak number alone cannot say (a
// restarted streak can land on a tier whose badge is already held).
async function scBadgeSnapshot(sc) {
  const badges = [false];
  for (let t = 1; t <= 4; t++) badges.push((await sc.badgeOf(account, t)) !== 0n);
  return { badges, magnum: await sc.hasMagnum(account) };
}
async function refreshMine() {
  if (!account) return;
  if (!deployed(CFG.PRELUDE_ADDRESS) || !deployed(CFG.SOUNDCHECK_ADDRESS)) {
    setText("myPrelude", T("w_notlive_prelude"));
    setText("mySoundcheck", T("w_notlive_sc"));
    if (window.SymphonyMelody) window.SymphonyMelody.setMelodyNumber(0);
    return;
  }
  const prelude = new ethers.Contract(CFG.PRELUDE_ADDRESS, ABI.PreludeRegistry, provider);
  const sc = new ethers.Contract(CFG.SOUNDCHECK_ADDRESS, ABI.Soundcheck, provider);
  const reg = await prelude.isRegistered(account);
  const has = await prelude.hasPass(account);
  // Melody number = the holder's Prelude tokenId (registration order).
  let melNo = 0;
  if (reg && has) {
    try { melNo = Number(await prelude.passOf(account)); } catch (e) { melNo = 0; }
  }
  if (window.SymphonyMelody) window.SymphonyMelody.setMelodyNumber(melNo);
  setText("myPrelude", reg ? (has ? T("w_reg_pass") : T("w_reg_burned")) : T("w_reg_no"));
  setText("myPreludePresale", reg ? T("w_prelude_yes") : T("w_prelude_no"));
  const btn = $("registerBtn");
  if (btn) btn.disabled = reg;
  updateRefNote(reg);
  // Referral card: once registered, show the personal link
  // (site URL + ?ref=<own address>) and the on-chain referral count.
  const refCard = $("referralCard");
  if (refCard) {
    refCard.hidden = !reg;
    if (reg) {
      const inp = $("refLinkInput");
      if (inp) inp.value = location.origin + location.pathname + "?ref=" + account;
      try { setText("refCount", String(Number(await prelude.referralCount(account)))); } catch (e) { /* view unavailable */ }
    }
  }

  const streak = Number(await sc.streakOf(account));
  const total = Number(await sc.totalCheckInsOf(account));
  const magnum = await sc.hasMagnum(account);
  const poolShare = Number(ethers.formatUnits(await sc.poolSharePaid(account), 18));
  let highest = 0;
  for (let t = 1; t <= 4; t++) {
    if ((await sc.badgeOf(account, t)) !== 0n) highest = t;
  }
  setText("mySoundcheck",
    T("w_sc_line", {
      streak, total,
      badge: highest === 0 ? T("w_badge_none") : BADGE_NAMES[highest],
    }) +
    (magnum ? T("w_magnum_held") : "") +
    (poolShare > 0 ? T("w_poolshare", { amt: poolShare.toFixed(2) }) : ""));
}

async function doRegister() {
  if (!signer) await connect();
  if (!signer || !deployed(CFG.PRELUDE_ADDRESS)) return;
  const prelude = new ethers.Contract(CFG.PRELUDE_ADDRESS, ABI.PreludeRegistry, signer);
  // Referral arrival: register through registerRef — except a link
  // pointing at the visitor's own address, which is just register().
  const useRef = REF_PARAM && account && REF_PARAM.toLowerCase() !== account.toLowerCase();
  const tx = useRef ? await prelude.registerRef(REF_PARAM) : await prelude.register();
  setText("myPrelude", T("w_reg_sent"));
  await tx.wait();
  await refreshMine();
  await refreshPublic();
  // Claim sound: the Prelude Pass motif, identical for every holder.
  if (window.SymphonySound) window.SymphonySound.play("prelude").catch(() => {});
}

async function copyRefLink() {
  const inp = $("refLinkInput");
  if (!inp || !inp.value) return;
  try {
    await navigator.clipboard.writeText(inp.value);
  } catch (e) {
    inp.select();
    document.execCommand("copy");
  }
  setText("refCopyStatus", T("ref_copied"));
}

async function doCheckIn() {
  if (!signer) await connect();
  if (!signer || !deployed(CFG.SOUNDCHECK_ADDRESS)) return;
  const sc = new ethers.Contract(CFG.SOUNDCHECK_ADDRESS, ABI.Soundcheck, signer);
  const before = await scBadgeSnapshot(sc).catch(() => null);
  const tx = await sc.checkIn();
  setText("mySoundcheck", T("w_ci_sent"));
  await tx.wait();
  const after = await scBadgeSnapshot(sc).catch(() => null);
  await refreshMine();
  // Claim sounds: only when THIS check-in minted a badge (a plain
  // check-in stays silent). On the day-14 check-in the FULL SCORE
  // motif plays first, then the OPUS MAGNUM motif as the finale.
  if (before && after && window.SymphonySound) {
    try {
      let newTier = 0;
      for (let t = 1; t <= 4; t++) if (after.badges[t] && !before.badges[t]) newTier = t;
      const magnumMinted = after.magnum && !before.magnum;
      if (newTier > 0) {
        const done = await window.SymphonySound.play("badge" + newTier);
        if (done && magnumMinted) await window.SymphonySound.play("magnum");
      } else if (magnumMinted) {
        await window.SymphonySound.play("magnum");
      }
    } catch (e) { /* sound is decoration — never block the flow */ }
  }
}

async function doRepair() {
  if (!signer) await connect();
  if (!signer || !deployed(CFG.SOUNDCHECK_ADDRESS)) return;
  const scAddr = CFG.SOUNDCHECK_ADDRESS;
  const usdt = new ethers.Contract(CFG.USDT_ADDRESS, ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], signer);
  const fee = ethers.parseUnits("0.1", 18);
  const allowance = await usdt.allowance(account, scAddr);
  if (allowance < fee) {
    setText("mySoundcheck", T("w_approve"));
    const atx = await usdt.approve(scAddr, fee);
    await atx.wait();
  }
  const sc = new ethers.Contract(scAddr, ABI.Soundcheck, signer);
  const tx = await sc.repairStreak();
  setText("mySoundcheck", T("w_repair_sent"));
  await tx.wait();
  await refreshMine();
}

function wire(id, fn) {
  const el = $(id);
  if (el) el.addEventListener("click", () => fn().catch((e) => {
    const msg = (e && (e.shortMessage || e.message)) || "Transaction failed";
    setText("walletStatus", T("w_error", { msg: String(msg).slice(0, 220) }));
  }));
}
wire("connectBtn", connect);
wire("registerBtn", doRegister);
wire("copyRefBtn", copyRefLink);
wire("checkInBtn", doCheckIn);
wire("repairBtn", doRepair);

// ---------- contact form (Web3Forms + Turnstile) ----------
const form = $("csForm");
if (form) {
  const keyInput = $("csAccessKey");
  if (keyInput) keyInput.value = CFG.WEB3FORMS_ACCESS_KEY;
  const ts = $("turnstileBox");
  if (ts) ts.setAttribute("data-sitekey", CFG.TURNSTILE_SITE_KEY);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (CFG.WEB3FORMS_ACCESS_KEY.startsWith("REPLACE_")) {
      setText("csStatus", T("cs_inactive"));
      return;
    }
    const data = new FormData(form);
    try {
      const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: data });
      const json = await res.json();
      setText("csStatus", json.success ? T("cs_ok") : T("cs_fail"));
      if (json.success) form.reset();
    } catch (e) {
      setText("csStatus", T("cs_fail"));
    }
  });
}

updateRefNote(false);
refreshPublic();
