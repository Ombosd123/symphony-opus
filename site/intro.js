// intro.js — SYMPHONY homepage intro splash (site layer only;
// loaded ONLY by index.html — no other page shows it).
//
// ============================================================
//  WHAT IT IS (the project's instruction, 2026-11-22): when a
//  visitor opens the site link, a short ±10-second intro plays
//  and can be SKIPPED from the first second; it ends on the line
//  "Find your melody." (i18n key intro_line — an HTML overlay,
//  never baked into any artwork), tying into Your Melody: every
//  address carries its own melody.
//
//  MEDIA NOTE: the original plan was a generated video file. The
//  video-generation tool is unavailable for this account (region
//  restriction, confirmed 2026-11-22), so the splash ships as a
//  silent animated scene built from inline SVG + CSS (baton taps,
//  staff lines drawing themselves, eight golden notes appearing
//  one by one, a warm swell, a treble-clef sparkle) that settles
//  into the generated poster frame (assets/intro-poster.webp).
//  If a real video file is ever produced, it can replace the
//  scene inside this same overlay without touching the rules.
//
//  LOCKED RULES (do not weaken):
//   - SILENT by design. Nothing here plays or schedules any
//     sound. The only sound path is the end card's "Hear a
//     melody" BUTTON: an explicit click that calls
//     SymphonyMelody.playAddress (melody.js) — the existing
//     click-gated WebAudio engine. No autoplay audio, ever.
//   - NO text inside the artwork. Every word is HTML + i18n.
//   - ONCE PER VISITOR: localStorage "symphony-intro-seen" is set
//     on any dismissal; returning visitors (daily Soundcheck
//     users) never see it again automatically. The flag check
//     runs BEFORE any overlay node is created, so returning
//     visitors get zero overlay markup and zero layout shift.
//     A "Replay intro" link in the footer clears the flag and
//     plays it again on demand.
//   - prefers-reduced-motion: no scene at all — a static end
//     card (poster + line + buttons) that waits for the visitor.
//   - Esc dismisses, Skip dismisses, the scene ends into an end
//     card that shows ~2.5 s (timer pauses while the visitor
//     hovers or focuses it) and then fades. Dismissal removes
//     the overlay from the DOM entirely.
// ============================================================
(function () {
  const FLAG = "symphony-intro-seen";
  // The worked-example address of the public Your Melody recipe
  // (the same fixture behind art/melody-example-agentic-v3.wav):
  const EXAMPLE_ADDRESS = "0x7c2F6872De3678530D34fca7dEBbEFfc9dA73475";
  const TIMINGS = { scene: 10000, card: 2500, fade: 450 };
  const T = (key) => (window.t ? window.t(key) : key);
  const reducedMotion = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let overlay = null;
  let timers = [];
  let prevOverflow = "";
  let dismissed = true;

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers = [];
  }
  function seen() {
    try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(FLAG, "1"); } catch (e) {}
  }

  // ---------- scene markup (SVG + CSS animation; see style.css) ----------
  function sceneSVG() {
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const y = 318 + i * 31;
      lines.push(
        `<line class="intro-line" x1="90" y1="${y}" x2="1190" y2="${y}" ` +
        `pathLength="100" style="animation-delay:${(1.6 + i * 0.09).toFixed(2)}s" />`
      );
    }
    // Eight notes, one by one, a rising melody contour (the intro
    // shows A melody — the visitor's own waits in Your Melody).
    const notesAt = [
      [215, 452], [330, 428], [445, 404], [560, 416],
      [675, 372], [790, 344], [905, 316], [1020, 280],
    ];
    const notes = notesAt.map(([x, y], i) =>
      `<g transform="translate(${x},${y})"><use href="#introNoteShape" class="intro-note" ` +
      `style="animation-delay:${(3.5 + i * 0.48).toFixed(2)}s" /></g>`
    );
    return (
      `<svg class="intro-scene" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
      `<defs>` +
      `<linearGradient id="introGold" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#f0d47a"/><stop offset="1" stop-color="#d4af37"/>` +
      `</linearGradient>` +
      `<g id="introNoteShape">` +
      `<ellipse cx="0" cy="0" rx="16" ry="11" transform="rotate(-18)" fill="url(#introGold)"/>` +
      `<line x1="14" y1="-4" x2="14" y2="-64" stroke="#d4af37" stroke-width="3.5"/>` +
      `<path d="M14 -64 C 30 -56, 34 -44, 30 -30 C 32 -46, 26 -52, 14 -54 Z" fill="url(#introGold)"/>` +
      `</g>` +
      `</defs>` +
      `<g transform="translate(596,148)"><g class="intro-baton">` +
      `<line x1="0" y1="0" x2="158" y2="44" stroke="#e8cf7a" stroke-width="5" stroke-linecap="round"/>` +
      `<ellipse cx="0" cy="0" rx="15" ry="8.5" fill="#f0d47a"/>` +
      `</g></g>` +
      `<g class="intro-staff">${lines.join("")}</g>` +
      `<g class="intro-notes">${notes.join("")}</g>` +
      `<g transform="translate(640,352)"><path class="intro-spark" ` +
      `d="M0 -46 C5 -10 10 -5 46 0 C10 5 5 10 0 46 C-5 10 -10 5 -46 0 C-10 -5 -5 -10 0 -46 Z" ` +
      `fill="#f0d47a"/></g>` +
      `</svg>`
    );
  }

  function el(tag, cls, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function showIntro(staticOnly) {
    if (overlay) return; // already open
    dismissed = false;
    overlay = el("div", "intro-splash" + (staticOnly ? " intro-static" : ""), document.body);
    overlay.id = "introSplash";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", T("intro_aria"));

    el("div", "intro-glow", overlay);
    if (!staticOnly) {
      const scene = el("div", "intro-scene-wrap", overlay);
      scene.innerHTML = sceneSVG();
    }
    const poster = el("img", "intro-poster", overlay);
    poster.src = "assets/intro-poster.webp";
    poster.alt = "";
    if (staticOnly) poster.className += " intro-poster-static";

    const card = el("div", "intro-card", overlay);
    const line = el("p", "intro-line-text", card);
    line.setAttribute("data-i18n", "intro_line");
    line.textContent = T("intro_line");
    const hear = el("button", "intro-hear", card);
    hear.type = "button";
    hear.setAttribute("data-i18n", "intro_hear");
    hear.textContent = T("intro_hear");
    hear.addEventListener("click", () => dismiss("hear"));
    if (!staticOnly) card.hidden = true;

    const skip = el("button", "intro-skip ghost", overlay);
    skip.type = "button";
    skip.setAttribute("data-i18n", "intro_skip");
    skip.textContent = T("intro_skip");
    skip.addEventListener("click", () => dismiss("skip"));

    prevOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("symphony-lang-changed", onLangChanged);

    // The end-card auto-dismiss pauses while the visitor is
    // reading or reaching for the button.
    let cardTimer = null;
    const armCardTimer = () => {
      cardTimer = later(() => dismiss("auto"), TIMINGS.card);
    };
    const showCard = () => {
      if (dismissed || !overlay) return;
      card.hidden = false;
      card.classList.add("intro-card-in");
      armCardTimer();
    };
    card.addEventListener("pointerenter", () => {
      if (cardTimer) { clearTimeout(cardTimer); cardTimer = null; }
    });
    card.addEventListener("pointerleave", () => {
      if (!dismissed && !card.hidden && !cardTimer) armCardTimer();
    });
    card.addEventListener("focusin", () => {
      if (cardTimer) { clearTimeout(cardTimer); cardTimer = null; }
    });

    if (staticOnly) {
      // Reduced motion: the static card is already visible and
      // simply waits — no timers, no motion.
      card.classList.add("intro-card-in");
    } else {
      later(showCard, TIMINGS.scene);
    }
    try { skip.focus({ preventScroll: true }); } catch (e) {}
  }

  function onKeydown(e) {
    if (e.key === "Escape") dismiss("esc");
  }
  function onLangChanged() {
    if (overlay) overlay.setAttribute("aria-label", T("intro_aria"));
  }

  function dismiss(reason) {
    if (!overlay || dismissed) return;
    dismissed = true;
    markSeen();
    clearTimers();
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("symphony-lang-changed", onLangChanged);
    const node = overlay;
    overlay = null;
    node.classList.add("intro-out");
    setTimeout(() => {
      node.remove();
      document.body.style.overflow = prevOverflow;
    }, TIMINGS.fade);
    if (reason === "hear") {
      // Close first, then scroll to Your Melody and let the
      // existing click-gated engine play the example melody.
      // playAddress runs synchronously inside this click handler,
      // so the AudioContext is created within the user gesture.
      const card = document.getElementById("melodyCard");
      const target = (card && !card.hidden) ? card : document.getElementById("prelude");
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      }
      document.body.style.overflow = prevOverflow;
      if (window.SymphonyMelody && typeof window.SymphonyMelody.playAddress === "function") {
        window.SymphonyMelody.playAddress(EXAMPLE_ADDRESS);
      }
    }
  }

  // Footer "Replay intro": clear the flag and play it again.
  const replay = document.getElementById("replayIntroLink");
  if (replay) {
    replay.addEventListener("click", (e) => {
      e.preventDefault();
      try { localStorage.removeItem(FLAG); } catch (err) {}
      showIntro(reducedMotion());
    });
  }

  window.SymphonyIntro = {
    show: () => showIntro(reducedMotion()),
    dismiss: () => dismiss("api"),
    timings: TIMINGS,
    flag: FLAG,
    exampleAddress: EXAMPLE_ADDRESS,
  };

  // First visit only — the flag check happens before ANY overlay
  // node exists, so returning visitors never pay for the splash.
  if (!seen()) showIntro(reducedMotion());
})();
