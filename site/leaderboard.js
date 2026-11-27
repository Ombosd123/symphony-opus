// leaderboard.js — tabbed boards (Soundcheck / Referral live,
// Holder / Presale marked Soon until phase 2 exists).
// Board data comes from leaderboard-data.json (full standings,
// generated from on-chain reads by leaderboard-gen.py, refreshed
// daily at 12:00 UTC). The page shows the top 9 per board plus the
// visitor's own rank, read live from the contracts when a wallet
// is connected — display only, never a signature.
(function () {
  const CFG = window.SYMPHONY_CONFIG || {};
  const ABI = window.SYMPHONY_ABI || {};
  const T = (key, vars) => (window.t ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TOP = 9;
  const BOARDS = {
    soundcheck: { title: "lb_checkin_title", cols: ["lb_col_rank", "lb_col_player", "lb_col_streak", "lb_col_total"], cells: (r) => [r.streak, r.total] },
    referral: { title: "lb_ref_title", cols: ["lb_col_rank", "lb_col_player", "lb_col_refs"], cells: (r) => [r.refs] },
    holder: { title: "lb_holder_title", soonTitle: "lb_soon_holder_title", soonText: "lb_soon_holder_text", cols: ["lb_col_rank", "lb_col_player", "lb_col_passes", "lb_col_vers"], cells: (r) => [r.passes, r.vers] },
    presale: { title: "lb_presale_title", soonTitle: "lb_soon_presale_title", soonText: "lb_soon_presale_text", cols: ["lb_col_rank", "lb_col_player", "lb_col_rest"], cells: (r) => [r.rest] },
  };
  // A phase-2 board is "Soon" exactly while its data is null in
  // leaderboard-data.json. The generator fills it in the moment the
  // first Pass is minted (holder) or the first REST exists
  // (presale) — the board opens by itself, no manual switch.
  function isSoon() {
    if (tab === "holder") return !data || !data.holder;
    if (tab === "presale") return !data || !data.presale;
    return false;
  }
  let data = null;
  let tab = "soundcheck";
  let account = null;
  const youCache = {};

  function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function fmt18(v) {
    const s = ethers.formatUnits(v, 18);
    return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
  }
  const ERC20_BAL = ["function balanceOf(address) view returns (uint256)"];
  function rows() {
    if (!data) return [];
    if (tab === "soundcheck") return data.checkin || [];
    if (tab === "referral") return data.referral || [];
    if (tab === "holder") return data.holder || [];
    if (tab === "presale") return data.presale || [];
    return [];
  }

  function render() {
    const b = BOARDS[tab];
    document.querySelectorAll(".lbtab").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-tab") === tab);
    });
    $("lbBoardTitle").textContent = T(b.title);
    const soon = isSoon();
    $("lbTableWrap").hidden = soon;
    $("lbSoonPanel").hidden = !soon;
    if (soon) {
      $("lbSoonTitle").textContent = T(b.soonTitle);
      $("lbSoonText").textContent = T(b.soonText);
      $("lbSoonCols").textContent = b.cols.map((k) => T(k)).join(" · ");
    } else if (data) {
      const head = $("lbHead");
      head.innerHTML = "";
      const htr = document.createElement("tr");
      for (const k of b.cols) {
        const th = document.createElement("th");
        th.textContent = T(k);
        htr.appendChild(th);
      }
      head.appendChild(htr);
      const body = $("lbBody");
      body.innerHTML = "";
      const all = rows();
      all.slice(0, TOP).forEach((r, i) => {
        const tr = document.createElement("tr");
        const rank = document.createElement("td");
        rank.textContent = String(i + 1);
        tr.appendChild(rank);
        const player = document.createElement("td");
        if (r.name) {
          player.textContent = r.name + ".ai";
          const sub = document.createElement("span");
          sub.className = "lbaddr";
          sub.textContent = shortAddr(r.addr);
          player.appendChild(sub);
        } else {
          player.textContent = shortAddr(r.addr);
        }
        tr.appendChild(player);
        for (const v of b.cells(r)) {
          const td = document.createElement("td");
          td.textContent = String(v);
          tr.appendChild(td);
        }
        body.appendChild(tr);
      });
      $("lbEmpty").hidden = all.length > 0;
      const up = $("lbUpdated");
      if (up && data.updated) {
        up.textContent = new Date(data.updated * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
      }
    }
    renderYou();
  }

  async function loadYou() {
    if (!account || !window.ethers) return;
    const p = new ethers.JsonRpcProvider(CFG.READ_RPC);
    try {
      if (youCache.name === undefined && CFG.AGENT_ID_REGISTRY) {
        const reg = new ethers.Contract(CFG.AGENT_ID_REGISTRY,
          ["function handleOf(address) view returns (string)"], p);
        youCache.name = (await reg.handleOf(account)) || "";
      }
    } catch (e) { youCache.name = ""; }
    try {
      if (tab === "soundcheck" && !youCache.soundcheck) {
        const sc = new ethers.Contract(CFG.SOUNDCHECK_ADDRESS, ABI.Soundcheck, p);
        youCache.soundcheck = {
          streak: Number(await sc.streakOf(account)),
          total: Number(await sc.totalCheckInsOf(account)),
        };
      } else if (tab === "referral" && !youCache.referral) {
        const pre = new ethers.Contract(CFG.PRELUDE_ADDRESS, ABI.PreludeRegistry, p);
        youCache.referral = { refs: Number(await pre.referralCount(account)) };
      } else if (tab === "holder" && !youCache.holder && CFG.PASS_ADDRESS) {
        const pass = new ethers.Contract(CFG.PASS_ADDRESS, ERC20_BAL, p);
        const passes = Number(await pass.balanceOf(account));
        let vers = "0";
        if (CFG.VERS_ADDRESS) {
          const v = new ethers.Contract(CFG.VERS_ADDRESS, ERC20_BAL, p);
          vers = fmt18(await v.balanceOf(account));
        }
        youCache.holder = { passes, vers };
      } else if (tab === "presale" && !youCache.presale && CFG.REST_ADDRESS) {
        const rest = new ethers.Contract(CFG.REST_ADDRESS, ERC20_BAL, p);
        youCache.presale = { rest: Number(fmt18(await rest.balanceOf(account))) };
      }
    } catch (e) { /* a failed read leaves the connect prompt in place */ }
    renderYou();
  }

  function renderYou() {
    const el = $("lbYouText");
    const btn = $("lbConnectBtn");
    if (!el) return;
    if (!account) {
      el.textContent = T("lb_you_connect");
      if (btn) btn.hidden = false;
      return;
    }
    if (btn) btn.hidden = true;
    const me = T("lb_you") + " · " + (youCache.name ? youCache.name + ".ai" : shortAddr(account));
    if (isSoon()) { el.textContent = me + " · " + T("lb_soon"); return; }
    if (!data) { el.textContent = me; return; }
    if (tab === "soundcheck") {
      const y = youCache.soundcheck;
      if (!y) { el.textContent = me + " · " + T("prof_loading"); loadYou(); return; }
      if (y.total === 0) { el.textContent = me + " · " + T("lb_not_ranked"); return; }
      let rank = 1;
      for (const r of data.checkin || []) {
        if (r.streak > y.streak || (r.streak === y.streak && r.total > y.total)) rank++;
      }
      el.textContent = me + " · " + T("lb_rank", { n: rank }) + " · " +
        T("lb_col_streak") + " " + y.streak + " · " + y.total + " " + T("lb_col_total");
    } else if (tab === "referral") {
      const y = youCache.referral;
      if (!y) { el.textContent = me + " · " + T("prof_loading"); loadYou(); return; }
      if (y.refs === 0) { el.textContent = me + " · " + T("lb_not_ranked"); return; }
      let rank = 1;
      for (const r of data.referral || []) if (r.refs > y.refs) rank++;
      el.textContent = me + " · " + T("lb_rank", { n: rank }) + " · " + y.refs + " " + T("lb_col_refs");
    } else if (tab === "holder") {
      const y = youCache.holder;
      if (!y) { el.textContent = me + " · " + T("prof_loading"); loadYou(); return; }
      if (!y.passes) { el.textContent = me + " · " + T("lb_not_ranked"); return; }
      let rank = 1;
      for (const r of data.holder || []) if (r.passes > y.passes) rank++;
      el.textContent = me + " · " + T("lb_rank", { n: rank }) + " · " +
        y.passes + " " + T("lb_col_passes") + " · " + y.vers + " VERS";
    } else if (tab === "presale") {
      const y = youCache.presale;
      if (!y) { el.textContent = me + " · " + T("prof_loading"); loadYou(); return; }
      if (!y.rest) { el.textContent = me + " · " + T("lb_not_ranked"); return; }
      let rank = 1;
      for (const r of data.presale || []) if (Number(r.rest) > y.rest) rank++;
      el.textContent = me + " · " + T("lb_rank", { n: rank }) + " · " + y.rest + " REST";
    }
  }

  async function connect() {
    if (!window.ethereum) return;
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accs && accs.length) { account = accs[0]; loadYou(); renderYou(); }
    } catch (e) { /* declined */ }
  }

  document.querySelectorAll(".lbtab").forEach((el) => {
    el.addEventListener("click", () => {
      tab = el.getAttribute("data-tab");
      render();
      loadYou();
    });
  });
  const cbtn = $("lbConnectBtn");
  if (cbtn) cbtn.addEventListener("click", connect);
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", (accs) => {
      account = accs && accs.length ? accs[0] : null;
      for (const k of Object.keys(youCache)) delete youCache[k];
      renderYou();
      loadYou();
    });
  }
  document.addEventListener("symphony-lang-changed", render);
  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" })
      .then((accs) => { if (accs && accs.length) { account = accs[0]; renderYou(); loadYou(); } })
      .catch(() => {});
  }
  fetch("leaderboard-data.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { data = j; render(); })
    .catch(() => render());
  render();
})();
