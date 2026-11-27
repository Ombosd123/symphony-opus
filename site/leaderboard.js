// leaderboard.js — renders leaderboard-data.json (generated from
// on-chain reads by leaderboard-gen.py; see that file for the method).
// The page itself makes no RPC calls: it only reads the static file.
(function () {
  const T = (key, vars) => (window.t ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  let data = null;

  function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }

  function fillRows(bodyId, emptyId, rows, cells) {
    const body = $(bodyId);
    if (!body) return;
    body.innerHTML = "";
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      const rank = document.createElement("td");
      rank.textContent = String(i + 1);
      tr.appendChild(rank);
      const player = document.createElement("td");
      player.textContent = shortAddr(r.addr);
      tr.appendChild(player);
      for (const v of cells(r)) {
        const td = document.createElement("td");
        td.textContent = String(v);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
    const empty = $(emptyId);
    if (empty) empty.hidden = rows.length > 0;
  }

  function render() {
    if (!data) return;
    fillRows("lbCheckinBody", "lbCheckinEmpty", data.checkin || [],
      (r) => [r.streak, r.total]);
    fillRows("lbRefBody", "lbRefEmpty", data.referral || [],
      (r) => [r.refs]);
    const up = $("lbUpdated");
    if (up && data.updated) {
      up.textContent = new Date(data.updated * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    }
  }

  document.addEventListener("symphony-lang-changed", render);
  fetch("leaderboard-data.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { data = j; render(); })
    .catch(() => {});
})();
