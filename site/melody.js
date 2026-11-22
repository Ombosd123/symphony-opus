// melody.js — SYMPHONY "Your Melody" (site layer only).
// No contract is read or changed to derive a melody; the feature lives
// entirely in this file plus small display hooks in app.js.
//
// ============================================================
//  PUBLIC DERIVATION RECIPE (Open Score — anyone can recompute
//  the melody of any address, nothing is stored or assigned):
//   1. Take the 20 raw bytes of the wallet address.
//   2. h = keccak-256 of those 20 bytes; call its bytes b[0..31].
//   3. Notes: for i = 0..7, the note is SCALE[b[i] mod 10], where
//      SCALE is the C-major pentatonic scale over two octaves:
//      [C4, D4, E4, G4, A4, C5, D5, E5, G5, A5].
//   4. Rhythm: for i = 0..7, note i lasts 0.5 beat if b[8+i] is
//      even, 1 beat if b[8+i] is odd. Canonical tempo: 1 beat = 0.45 s.
//  The melody number shown for a registered holder is simply their
//  Prelude Pass tokenId (tokenIds are issued in registration order,
//  starting at 1). Your Melody is an identity/experience feature
//  only: it carries no claim, bonus, allocation or value.
//
//  PLAYBACK UX RULES (mandatory):
//   - NO autoplay, ever: sound only starts from an explicit click
//     on a Play button. Nothing here creates an AudioContext or
//     schedules a note on page load, navigation or data refresh.
//   - Every playback can be stopped instantly: while a playback
//     runs, its Play button becomes a Stop button; Stop cancels
//     every scheduled oscillator and disconnects the master gain
//     immediately — silence at once, not at the next note.
//   - Only one playback at a time: starting any playback first
//     stops the one currently running.
//   - Playback stops by itself at the end of the phrase, and is
//     stopped on pagehide/beforeunload, so it never continues
//     across pages.
// ============================================================
(function () {
  const SCALE = [
    { name: "C4", midi: 60 }, { name: "D4", midi: 62 }, { name: "E4", midi: 64 },
    { name: "G4", midi: 67 }, { name: "A4", midi: 69 }, { name: "C5", midi: 72 },
    { name: "D5", midi: 74 }, { name: "E5", midi: 76 }, { name: "G5", midi: 79 },
    { name: "A5", midi: 81 },
  ];
  const BEAT_SECONDS = 0.45; // canonical tempo: 1 beat = 0.45 seconds
  const T = (key, vars) => (window.t ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function hashBytes(address) {
    if (typeof ethers === "undefined") return null;
    try {
      return ethers.getBytes(ethers.keccak256(ethers.getBytes(address)));
    } catch (e) {
      return null;
    }
  }

  // THE canonical derivation (locked 2026-11-22) — do not
  // change: notes and rhythm come only from the hash bytes above.
  function notesFromBytes(bytes) {
    const notes = [];
    for (let i = 0; i < 8; i++) {
      const s = SCALE[bytes[i] % 10];
      notes.push({ name: s.name, midi: s.midi, beats: bytes[8 + i] % 2 === 0 ? 0.5 : 1 });
    }
    return notes;
  }

  function deriveMelody(address) {
    const bytes = hashBytes(address);
    return bytes ? notesFromBytes(bytes) : null;
  }

  // ---------- WebAudio playback engine (synthesised; no audio files) ----------
  let audioCtx = null; // created lazily, ONLY inside a Play click handler
  let active = null;   // { kind, sources, master, timer, token, resolve }
  let playToken = 0;   // incremented on every stop/start; stale runs abort

  function ensureCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();
    return audioCtx;
  }

  function clearStatuses() {
    const a = $("melodyStatus");
    if (a) a.textContent = "";
    const b = $("latestMelodyStatus");
    if (b) b.textContent = "";
  }

  function updateButtons() {
    const mine = $("melodyPlayBtn");
    if (mine) {
      mine.textContent = active && active.kind === "mine" ? T("mel_stop") : T("mel_play");
      mine.disabled = false;
    }
    const latest = $("latestMelodiesBtn");
    if (latest) {
      latest.textContent = active && active.kind === "latest" ? T("mel_stop") : T("mel_latest_btn");
      latest.disabled = false;
    }
  }

  // Instant silence: cancel every scheduled note, cut the master gain,
  // and resolve the running phrase as "stopped" so its runner aborts.
  function stopPlayback() {
    playToken++;
    if (!active) {
      updateButtons();
      return;
    }
    const a = active;
    active = null;
    if (a.timer) clearTimeout(a.timer);
    for (const s of a.sources) {
      try { s.stop(); } catch (e) {}
      try { s.disconnect(); } catch (e) {}
    }
    if (a.nodes) {
      for (const n of a.nodes) {
        try { n.disconnect(); } catch (e) {}
      }
    }
    if (a.master) {
      try { a.master.disconnect(); } catch (e) {}
    }
    clearStatuses();
    updateButtons();
    if (a.resolve) a.resolve(false);
  }

  // ---------- Layered-voice event engine (orchestral v3) ----------
  // Everything audible on this page — the claim motifs AND the Your
  // Melody arrangement — is a list of events:
  //   { at, midi | [midis], dur, vol, voice }
  // (at/dur in seconds, vol a 0..1 peak). Voices are small WebAudio
  // recipes approximating orchestra sections (the same design as the
  // approved v3 preview renders): strings = 3 detuned saws through a
  // lowpass with a slow bow attack; brass = saw through a brighter
  // lowpass with a swell; flute = sine + soft octave; harp / pizz =
  // plucked decays; timp = a sine whose pitch settles up from 25%
  // low in the first ~200 ms under a fast decay. One shared playback
  // slot: every oscillator and node is tracked so stopPlayback()
  // silences a running sound instantly.
  const ev = (at, midi, dur, vol, voice) => ({ at, midi, dur, vol, voice });
  const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function envSwell(g, t, dur, vol, attack, floorRatio) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol * floorRatio), t + Math.max(attack + 0.01, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  }
  function envPluck(g, t, dur, vol, span) {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, dur * span));
  }

  function scheduleVoice(ctx, master, bag, voice, midi, t, dur, vol) {
    const f = midiFreq(midi);
    const g = ctx.createGain();
    g.connect(master);
    bag.nodes.push(g);
    let input = g;
    if (voice === "strings" || voice === "brass") {
      const fl = ctx.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = voice === "strings" ? 1200 : 1800;
      fl.connect(g);
      bag.nodes.push(fl);
      input = fl;
    }
    const osc = (type, freq, detuneCents, rel) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detuneCents) o.detune.value = detuneCents;
      let dest = input;
      if (rel !== 1) {
        const rg = ctx.createGain();
        rg.gain.value = rel;
        rg.connect(input);
        bag.nodes.push(rg);
        dest = rg;
      }
      o.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.1);
      bag.sources.push(o);
      bag.nodes.push(o);
    };
    switch (voice) {
      case "strings":
        envSwell(g, t, dur, vol, 0.09, 0.62);
        osc("sawtooth", f, -6, 1 / 3);
        osc("sawtooth", f, 0, 1 / 3);
        osc("sawtooth", f, 5, 1 / 3);
        break;
      case "brass":
        envSwell(g, t, dur, vol, 0.07, 0.7);
        osc("sawtooth", f, 0, 1);
        break;
      case "flute":
        envSwell(g, t, dur, vol, 0.03, 0.55);
        osc("sine", f, 0, 1);
        osc("sine", f * 2, 0, 0.25);
        break;
      case "harp":
        envPluck(g, t, dur, vol, 1);
        osc("triangle", f, 0, 1);
        break;
      case "pizz":
        envPluck(g, t, dur, vol, 0.85);
        osc("triangle", f, 0, 0.6);
        osc("sine", f, 0, 0.4);
        break;
      case "timp": {
        envPluck(g, t, dur, vol, 1);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f * 0.75, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.21);
        o.connect(input);
        o.start(t);
        o.stop(t + dur + 0.1);
        bag.sources.push(o);
        bag.nodes.push(o);
        break;
      }
      default:
        envSwell(g, t, dur, vol, 0.02, 0.1);
        osc("triangle", f, 0, 1);
    }
  }

  // Schedules one event list; resolves true if it played to its
  // natural end, false if stopPlayback() interrupted it.
  function playEvents(events, kind, token) {
    return new Promise((resolve) => {
      const ctx = ensureCtx();
      if (!ctx || !events || !events.length || token !== playToken) {
        resolve(false);
        return;
      }
      const master = ctx.createGain();
      master.gain.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      master.connect(comp);
      comp.connect(ctx.destination);
      const bag = { sources: [], nodes: [comp] };
      const t0 = ctx.currentTime + 0.05;
      let total = 0;
      for (const e of events) {
        const midis = Array.isArray(e.midi) ? e.midi : [e.midi];
        for (const m of midis) scheduleVoice(ctx, master, bag, e.voice, m, t0 + e.at, e.dur, e.vol);
        total = Math.max(total, e.at + e.dur);
      }
      const timer = setTimeout(() => {
        if (active && active.token === token) active = null;
        resolve(true);
      }, total * 1000 + 150);
      active = { kind, sources: bag.sources, nodes: bag.nodes, master, timer, token, resolve };
      updateButtons();
    });
  }

  // ---------- Your Melody — orchestral arrangement (v3) ----------
  // The DERIVATION above is locked and unchanged; only the rendering
  // grew (2026-11-22: "megah seperti Magnum"). The 8
  // derived notes stay the lead line, note-for-note: flute (0.42)
  // doubled softly by strings (0.22) at the canonical tempo. Under
  // them, two strings pad chords (0.30): C major [48,52,55] for
  // notes 1–4, and for notes 5–8 a chord picked by hash byte h[16]
  // mod 4 — 0: G [43,47,50], 1: Am [45,48,52], 2: F [41,45,48],
  // 3: C [48,52,55] (all safe under the C-major pentatonic scale).
  // The phrase closes like the Magnum motif: a tutti triad built on
  // the LAST melody note (root = last − 24, folded into midi 36–55)
  // in brass (0.40) + strings (0.30) for ~0.8 s, with a soft timpani
  // hit on the root. Deterministic: same address, same arrangement.
  const PAD_SECOND = [[43, 47, 50], [45, 48, 52], [41, 45, 48], [48, 52, 55]];
  function arrangeMelody(address) {
    const bytes = hashBytes(address);
    if (!bytes) return null;
    const notes = notesFromBytes(bytes);
    const starts = [];
    let t = 0;
    for (const n of notes) {
      starts.push(t);
      t += n.beats * BEAT_SECONDS;
    }
    const total = t;
    const halfAt = starts[4];
    const events = [
      ev(0, [48, 52, 55], halfAt, 0.30, "strings"),
      ev(halfAt, PAD_SECOND[bytes[16] % 4], total - halfAt, 0.30, "strings"),
    ];
    notes.forEach((n, i) => {
      const dur = n.beats * BEAT_SECONDS;
      events.push(ev(starts[i], n.midi, dur, 0.42, "flute"));
      events.push(ev(starts[i], n.midi, dur, 0.22, "strings"));
    });
    let root = notes[notes.length - 1].midi - 24;
    while (root > 55) root -= 12;
    while (root < 36) root += 12;
    const triad = [root, root + 4, root + 7];
    events.push(ev(total + 0.02, triad, 0.8, 0.40, "brass"));
    events.push(ev(total + 0.02, triad, 0.8, 0.30, "strings"));
    events.push(ev(total + 0.02, root, 0.8, 0.35, "timp"));
    return events;
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // ---------- UI state ----------
  let currentAccount = null;
  let melodyNumber = 0; // Prelude tokenId if registered & holding, else 0
  let latestProvider = null; // async () => [address, ...] newest-first, or null

  function render() {
    const card = $("melodyCard");
    if (!card) return;
    if (!currentAccount) {
      card.hidden = true;
      return;
    }
    const notes = deriveMelody(currentAccount);
    if (!notes) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const notesEl = $("melodyNotes");
    if (notesEl) notesEl.textContent = notes.map((n) => n.name).join(" ");
    const noEl = $("melodyNo");
    if (noEl) {
      noEl.textContent = melodyNumber > 0
        ? T("mel_number", { n: melodyNumber })
        : T("mel_no_number");
    }
  }

  function renderLatest() {
    const row = $("latestMelodyRow");
    if (row) row.hidden = !latestProvider;
  }

  async function runMine(token) {
    const events = arrangeMelody(currentAccount);
    if (!events) return;
    const st = $("melodyStatus");
    if (st) st.textContent = T("mel_playing");
    const done = await playEvents(events, "mine", token);
    if (token !== playToken) return; // stopped — stopPlayback already reset the UI
    if (done) {
      clearStatuses();
      updateButtons();
    }
  }

  async function runLatest(token) {
    let addrs = [];
    try {
      addrs = await latestProvider();
    } catch (e) {
      addrs = [];
    }
    if (token !== playToken || !addrs || !addrs.length) {
      if (token === playToken) updateButtons();
      return;
    }
    const st = $("latestMelodyStatus");
    for (let i = 0; i < addrs.length; i++) {
      if (token !== playToken) return;
      if (st) st.textContent = T("mel_latest_playing", { cur: i + 1, total: addrs.length });
      const events = arrangeMelody(addrs[i]);
      if (!events) continue;
      const done = await playEvents(events, "latest", token);
      if (token !== playToken || !done) return; // stopped mid-phrase
      if (i < addrs.length - 1) await sleep(350);
    }
    if (token === playToken) {
      clearStatuses();
      updateButtons();
    }
  }

  function onMineClick() {
    if (active && active.kind === "mine") {
      stopPlayback(); // toggle: Play became Stop
      return;
    }
    if (!currentAccount) return;
    stopPlayback(); // one playback at a time — stop whatever is running
    runMine(playToken).catch(() => {});
  }

  function onLatestClick() {
    if (active && active.kind === "latest") {
      stopPlayback(); // toggle: Play became Stop
      return;
    }
    if (!latestProvider) return;
    stopPlayback(); // one playback at a time
    runLatest(playToken).catch(() => {});
  }

  // Plays the orchestral arrangement of ANY address (same engine,
  // same single-playback slot). Used by the homepage intro splash:
  // its "Hear a melody" button is the explicit click, and it plays
  // the worked-example address from the public derivation recipe.
  async function runExample(address, token) {
    const events = arrangeMelody(address);
    if (!events) return;
    const done = await playEvents(events, "example", token);
    if (token !== playToken) return; // stopped — stopPlayback already reset the UI
    if (done) {
      clearStatuses();
      updateButtons();
    }
  }

  function playAddress(address) {
    if (active && active.kind === "example") {
      stopPlayback(); // toggle: a second call stops the example
      return;
    }
    if (!address) return;
    stopPlayback(); // one playback at a time
    runExample(address, playToken).catch(() => {});
  }

  const playBtn = $("melodyPlayBtn");
  if (playBtn) playBtn.addEventListener("click", onMineClick);
  const latestBtn = $("latestMelodiesBtn");
  if (latestBtn) latestBtn.addEventListener("click", onLatestClick);
  window.addEventListener("pagehide", stopPlayback);
  window.addEventListener("beforeunload", stopPlayback);
  document.addEventListener("symphony-lang-changed", () => {
    render();
    renderLatest();
    updateButtons();
  });
  renderLatest();
  updateButtons();

  // ---------- Claim sounds (site layer only) ----------
  // The mirror image of Your Melody: where a Melody is unique per
  // ADDRESS, a claim sound is identical for every user and differs
  // only by NFT TYPE. Fixed ORCHESTRAL motifs (v3, approved
  // 2026-11-22, replacing the v1 single-line motifs):
  // layered strings / brass / flute / harp / pizz / timpani event
  // tables, synthesised live by the voice engine above (no audio
  // files), played ONLY as the direct result of a successful
  // claim/mint the user just made from this page — never on page
  // load, never as autoplay. They share the engine's single-playback
  // slot, so a claim sound stops any playing Melody and a Melody
  // stops any claim sound; pagehide silences both. A plain check-in
  // that mints no badge stays silent. The Opus Magnum is trimmed to
  // ≈3.2 s. Phase 2 will add keys here (Pass tiers, burn-to-claim)
  // when the sale ships; the table shape already allows it.
  const CLAIM_MOTIFS = {
    // PRELUDE PASS — string chord swell + harp arpeggio + flute line
    prelude: [
      ev(0, [48, 52, 55], 2.0, 0.50, "strings"),
      ev(0.15, 72, 0.5, 0.30, "harp"), ev(0.26, 76, 0.5, 0.30, "harp"),
      ev(0.37, 79, 0.5, 0.30, "harp"), ev(0.48, 84, 0.5, 0.30, "harp"),
      ev(0.55, 76, 0.3, 0.40, "flute"), ev(0.85, 79, 0.3, 0.40, "flute"),
      ev(1.15, 81, 0.55, 0.40, "flute"),
      ev(1.15, [60, 64], 0.8, 0.25, "strings"),
    ],
    // FIRST NOTE — pizzicato arpeggio + flute sparkle over strings
    badge1: [
      ev(0, 60, 0.3, 0.50, "pizz"), ev(0.10, 64, 0.3, 0.50, "pizz"),
      ev(0.20, 67, 0.3, 0.50, "pizz"),
      ev(0.30, 72, 0.6, 0.42, "flute"),
      ev(0.30, [48, 55], 0.6, 0.30, "strings"),
    ],
    // TUNING — string swell, brass phrase settling on A, flute sheen
    badge2: [
      ev(0, [45, 52, 57], 1.7, 0.45, "strings"),
      ev(0.10, 69, 0.45, 0.30, "brass"), ev(0.60, 76, 0.22, 0.30, "brass"),
      ev(0.82, 71, 0.22, 0.30, "brass"), ev(1.04, 69, 0.6, 0.34, "brass"),
      ev(1.04, 76, 0.6, 0.15, "flute"),
    ],
    // REHEARSAL — bouncy pizzicato run + flute answer over strings
    badge3: [
      ev(0, [48, 55], 1.8, 0.30, "strings"),
      ev(0.05, 60, 0.16, 0.50, "pizz"), ev(0.194, 62, 0.16, 0.50, "pizz"),
      ev(0.338, 64, 0.16, 0.50, "pizz"), ev(0.482, 67, 0.22, 0.50, "pizz"),
      ev(0.68, 69, 0.22, 0.50, "pizz"),
      ev(1.0, 72, 0.2, 0.40, "flute"), ev(1.2, 69, 0.2, 0.40, "flute"),
      ev(1.4, 67, 0.45, 0.40, "flute"),
    ],
    // FULL SCORE — mini fanfare: brass+strings melody, tutti ending
    badge4: [
      ev(0, [48, 55], 2.4, 0.35, "strings"),
      ev(0.05, 60, 0.2, 0.42, "brass"), ev(0.05, 60, 0.2, 0.30, "strings"),
      ev(0.24, 64, 0.2, 0.42, "brass"), ev(0.24, 64, 0.2, 0.30, "strings"),
      ev(0.43, 67, 0.2, 0.42, "brass"), ev(0.43, 67, 0.2, 0.30, "strings"),
      ev(0.62, 72, 0.3, 0.42, "brass"), ev(0.62, 72, 0.3, 0.30, "strings"),
      ev(0.905, 76, 0.24, 0.42, "brass"), ev(0.905, 76, 0.24, 0.30, "strings"),
      ev(1.133, 74, 0.24, 0.42, "brass"), ev(1.133, 74, 0.24, 0.30, "strings"),
      ev(1.361, 72, 0.34, 0.42, "brass"), ev(1.361, 72, 0.34, 0.30, "strings"),
      ev(1.73, [60, 64, 67, 72], 0.7, 0.50, "brass"),
      ev(1.73, [48, 52, 55], 0.7, 0.35, "strings"),
    ],
    // OPUS MAGNUM — timpani + brass stabs, string/flute run, tutti
    // chord and a brass tag; total ≈3.23 s (trimmed from the ±4.2 s
    // preview at the project's approval).
    magnum: [
      ev(0, 36, 0.5, 0.80, "timp"),
      ev(0, [36, 48], 3.0, 0.30, "strings"),
      ev(0.05, [60, 64, 67], 0.35, 0.50, "brass"),
      ev(0.45, [60, 64, 67], 0.35, 0.50, "brass"),
      ev(0.45, 41, 0.4, 0.70, "timp"),
      ev(0.90, 60, 0.28, 0.45, "strings"), ev(0.90, 60, 0.28, 0.22, "flute"),
      ev(1.005, 64, 0.28, 0.45, "strings"), ev(1.005, 64, 0.28, 0.22, "flute"),
      ev(1.11, 67, 0.28, 0.45, "strings"), ev(1.11, 67, 0.28, 0.22, "flute"),
      ev(1.215, 72, 0.28, 0.45, "strings"), ev(1.215, 72, 0.28, 0.22, "flute"),
      ev(1.32, 76, 0.28, 0.45, "strings"), ev(1.32, 76, 0.28, 0.22, "flute"),
      ev(1.425, 79, 0.28, 0.45, "strings"), ev(1.425, 79, 0.28, 0.22, "flute"),
      ev(1.53, 84, 0.28, 0.45, "strings"), ev(1.53, 84, 0.28, 0.22, "flute"),
      ev(1.70, [60, 64, 67, 72], 0.7, 0.55, "brass"),
      ev(1.70, [72, 76, 79, 84], 0.7, 0.30, "strings"),
      ev(1.70, 36, 0.7, 0.80, "timp"),
      ev(2.48, 76, 0.16, 0.45, "brass"), ev(2.63, 74, 0.16, 0.45, "brass"),
      ev(2.78, 72, 0.45, 0.45, "brass"),
    ],
  };
  const SOUND_KEY = "symphony-sound"; // localStorage: "on" | "off"
  function soundEnabled() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; }
  }
  function setSoundEnabled(on) {
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch (e) {}
    if (!on) stopPlayback();
    renderSoundToggle();
  }
  // Resolves true if the motif played to its natural end, false if
  // sound is off, the type is unknown, or playback was stopped.
  function playClaimSound(type) {
    const events = CLAIM_MOTIFS[type];
    if (!events || !soundEnabled()) return Promise.resolve(false);
    stopPlayback(); // one sound at a time, whichever kind came first
    return playEvents(events, "claim", playToken);
  }
  const soundBtn = $("soundToggleBtn");
  function renderSoundToggle() {
    if (!soundBtn) return;
    const on = soundEnabled();
    soundBtn.textContent = (on ? "🔊 " : "🔇 ") + T(on ? "snd_on" : "snd_off");
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  if (soundBtn) soundBtn.addEventListener("click", () => setSoundEnabled(!soundEnabled()));
  document.addEventListener("symphony-lang-changed", renderSoundToggle);
  renderSoundToggle();

  window.SymphonySound = {
    motifs: CLAIM_MOTIFS,
    play: playClaimSound,
    isEnabled: soundEnabled,
    setEnabled: setSoundEnabled,
  };

  window.SymphonyMelody = {
    deriveMelody,
    arrange: arrangeMelody,
    playAddress,
    stop: stopPlayback,
    isPlaying: () => !!active,
    setAccount(addr) {
      stopPlayback();
      currentAccount = addr || null;
      if (!currentAccount) melodyNumber = 0;
      render();
    },
    setMelodyNumber(n) {
      melodyNumber = Number(n) || 0;
      render();
    },
    // fn: async () => array of registrant addresses, newest first;
    // pass null to hide the "latest melodies" button (no data yet).
    setLatestProvider(fn) {
      latestProvider = typeof fn === "function" ? fn : null;
      renderLatest();
    },
  };
})();
