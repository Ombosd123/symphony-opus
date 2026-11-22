// sound-test.mjs — SYMPHONY site sound UX harness (Node, stubbed
// DOM / WebAudio / localStorage). Covers: Your Melody derivation
// (locked), the v3 orchestral claim-motif tables, the v3 Melody
// arrangement, and the playback rules (no AudioContext on load,
// click-only, one sound at a time, Stop, toggle persistence).
// Run: node sound-test.mjs
import { readFileSync } from "node:fs";
import { ethers } from "ethers";

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) passed++;
  else { failed++; console.log("FAIL:", label); }
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b),
    `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const F = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- stubs ----------
const clickHandlers = {};
function makeEl(id) {
  return {
    id, hidden: false, disabled: false, textContent: "",
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(ev, fn) { if (ev === "click") clickHandlers[id] = fn; },
    click() { if (clickHandlers[id]) clickHandlers[id](); },
  };
}
const els = {};
const store = {};
let ctxCount = 0;
const allOsc = [];
class StubParam {
  constructor(v = 0) { this.value = v; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(["set", v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.calls.push(["lin", v, t]); }
  exponentialRampToValueAtTime(v, t) { this.calls.push(["exp", v, t]); }
}
class StubOsc {
  constructor() {
    this.type = ""; this.frequency = new StubParam(440);
    this.detune = new StubParam(0);
    this.startedAt = null; this.stopArgs = [];
    allOsc.push(this);
  }
  connect() {} disconnect() {}
  start(t) { this.startedAt = t; }
  stop(t) { this.stopArgs.push(t); }
}
class StubGain { constructor() { this.gain = new StubParam(1); } connect() {} disconnect() {} }
class StubFilter {
  constructor() { this.type = ""; this.frequency = new StubParam(350); this.Q = new StubParam(1); }
  connect() {} disconnect() {}
}
class StubComp {
  constructor() {
    this.threshold = new StubParam(0); this.knee = new StubParam(0);
    this.ratio = new StubParam(0); this.attack = new StubParam(0);
    this.release = new StubParam(0);
  }
  connect() {} disconnect() {}
}
class StubCtx {
  constructor() {
    ctxCount++;
    this.currentTime = 1000; this.state = "running"; this.destination = {};
  }
  createOscillator() { return new StubOsc(); }
  createGain() { return new StubGain(); }
  createBiquadFilter() { return new StubFilter(); }
  createDynamicsCompressor() { return new StubComp(); }
  resume() {}
}
const windowStub = {
  addEventListener() {},
  t: (key) => key,
  ethers,
  AudioContext: StubCtx,
};
globalThis.window = windowStub;
globalThis.document = {
  getElementById(id) { return (els[id] ||= makeEl(id)); },
  addEventListener() {},
};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.ethers = ethers;

(0, eval)(readFileSync(new URL("./site/melody.js", import.meta.url), "utf8"));

const S = windowStub.SymphonySound;
const M = windowStub.SymphonyMelody;
const ADDR = "0x7c2F6872De3678530D34fca7dEBbEFfc9dA73475";
const stoppedByHand = (osc) => osc.stopArgs.some((a) => a === undefined);

// ---------- load-time + API ----------
ok(ctxCount === 0, "zero AudioContext created on load");
ok(S && typeof S.play === "function", "SymphonySound.play exists");
eq(Object.keys(S.motifs).sort(),
  ["badge1", "badge2", "badge3", "badge4", "magnum", "prelude"],
  "motif keys unchanged");

// ---------- derivation (locked, unchanged) ----------
const notes = M.deriveMelody(ADDR);
eq(notes.map((n) => n.name), ["G4", "A5", "C5", "C5", "A5", "G5", "D5", "A5"],
  "derivation notes unchanged (worked example)");
eq(notes.map((n) => n.beats), [0.5, 0.5, 1, 1, 0.5, 0.5, 0.5, 0.5],
  "derivation durations unchanged (worked example)");

// ---------- v3 claim tables ----------
const mo = S.motifs;
const p0 = mo.prelude[0];
ok(p0.voice === "strings" && JSON.stringify(p0.midi) === "[48,52,55]" &&
   p0.at === 0 && p0.dur === 2.0 && p0.vol === 0.5,
  "prelude opens with the strings C chord (2.0 s, v.50)");
eq(mo.prelude.filter((e) => e.voice === "harp").map((e) => e.midi), [72, 76, 79, 84],
  "prelude harp arpeggio 72/76/79/84");
eq(mo.badge1.filter((e) => e.voice === "pizz").map((e) => e.midi), [60, 64, 67],
  "badge1 pizzicato arpeggio");
ok(mo.badge2.some((e) => e.voice === "brass" && e.midi === 69 && e.at === 0.10),
  "badge2 brass phrase starts on A (69)");
eq(mo.badge3.filter((e) => e.voice === "pizz").length, 5, "badge3 five pizzicato notes");
ok(mo.badge4.some((e) => e.voice === "brass" && JSON.stringify(e.midi) === "[60,64,67,72]"),
  "badge4 tutti brass chord");
const magDur = Math.max(...mo.magnum.map((e) => e.at + e.dur));
ok(magDur <= 3.3 && magDur > 2.9, `magnum total duration ≤ 3.3 s (got ${magDur.toFixed(2)})`);
ok(mo.magnum.some((e) => e.voice === "timp" && e.midi === 36), "magnum has timpani hits");

// ---------- v3 Melody arrangement (structure) ----------
const arr = M.arrange(ADDR);
const lead = arr.filter((e) => e.voice === "flute" && e.vol === 0.42);
eq(lead.map((e) => e.midi), [67, 81, 72, 72, 81, 79, 74, 81],
  "arrangement lead = the 8 derived notes, in order");
ok(lead.length === 8 && lead.every((e, i) =>
  Math.abs(e.at - [0, 0.225, 0.45, 0.9, 1.35, 1.575, 1.8, 2.025][i]) < 1e-9),
  "arrangement lead starts at the derived rhythm");
const h = ethers.getBytes(ethers.keccak256(ethers.getBytes(ADDR)));
const PAD2 = [[43, 47, 50], [45, 48, 52], [41, 45, 48], [48, 52, 55]][h[16] % 4];
const pad2 = arr.find((e) => e.voice === "strings" && e.vol === 0.30 && e.at > 0);
eq(pad2 && pad2.midi, PAD2, "pad chord 2 follows the h[16] mod 4 rule");
const closeB = arr.find((e) => e.voice === "brass");
eq(closeB && closeB.midi, [45, 49, 52],
  "closing tutti triad from last note A5 (root 81-24 folded to 45)");
ok(closeB && Math.abs(closeB.at - 2.27) < 1e-9 && closeB.dur === 0.8,
  "closing chord after the last note, 0.8 s");
ok(arr.some((e) => e.voice === "timp" && e.midi === 45), "closing timpani on the root");

// ---------- playback behaviour ----------
async function main() {
  // prelude: full play, voice counts
  let before = allOsc.length;
  const p1 = S.play("prelude");
  ok(ctxCount === 1, "first play creates exactly one AudioContext");
  const preOsc = allOsc.slice(before);
  const t0 = Math.min(...preOsc.map((o) => o.startedAt));
  const firstChord = preOsc.filter((o) => o.startedAt === t0);
  eq(firstChord.length, 9, "prelude first chord = 3 midis x 3 detuned string osc");
  ok(firstChord.every((o) => o.type === "sawtooth"), "strings voice is sawtooth-based");
  ok((await p1) === true, "prelude resolves true at natural end");

  // unknown type: silent no-op
  before = allOsc.length;
  ok((await S.play("nope")) === false && allOsc.length === before,
    "unknown type = silent no-op");

  // toggle persistence + off means silent
  S.setEnabled(false);
  ok(store["symphony-sound"] === "off", "toggle persists 'off' in localStorage");
  before = allOsc.length;
  ok((await S.play("badge1")) === false && allOsc.length === before,
    "sound off = play is a silent no-op");
  S.setEnabled(true);
  ok(store["symphony-sound"] === "on", "toggle persists 'on' in localStorage");

  // exclusion: a claim sound stops a playing Melody
  M.setAccount(ADDR);
  const melFrom = allOsc.length;
  els["melodyPlayBtn"].click();
  await sleep(30);
  const melOsc = allOsc.slice(melFrom);
  ok(M.isPlaying() && melOsc.length > 0, "melody playing after Play click");
  ok((await S.play("badge1")) === true, "badge1 plays to its end");
  ok(melOsc.every(stoppedByHand), "claim sound stopped every melody oscillator");
  ok(!M.isPlaying(), "playback slot free after claim finishes");

  // arrangement rendering: the flute lead actually sounds the 8 notes
  const leadFrom = allOsc.length;
  els["melodyPlayBtn"].click();
  await sleep(30);
  const rend = allOsc.slice(leadFrom);
  const starts = [0, 0.225, 0.45, 0.9, 1.35, 1.575, 1.8, 2.025];
  const midis = [67, 81, 72, 72, 81, 79, 74, 81];
  let leadOk = true;
  for (let i = 0; i < 8; i++) {
    const hit = rend.some((o) => o.type === "sine" &&
      o.frequency.calls.length === 0 &&
      Math.abs(o.frequency.value - F(midis[i])) < 0.5 &&
      Math.abs(o.startedAt - (1000.05 + starts[i])) < 0.01);
    if (!hit) leadOk = false;
  }
  ok(leadOk, "rendered flute lead = 8 derived notes at derived times");
  M.stop();

  // exclusion: a Melody stops a playing claim sound
  const magP = S.play("magnum");
  await sleep(30);
  const magFrom = allOsc.length - 60; // magnum schedules many osc at once
  const magOsc = allOsc.slice(Math.max(0, magFrom));
  els["melodyPlayBtn"].click();
  ok((await magP) === false, "magnum interrupted by Melody resolves false");
  ok(magOsc.some(stoppedByHand), "melody stopped claim oscillators");
  M.stop();

  // explicit stop silences a claim sound
  const b2 = S.play("badge2");
  await sleep(30);
  M.stop();
  ok((await b2) === false, "Stop during claim sound resolves false");

  // latest-melodies uses the same grand arrangement
  M.setLatestProvider(async () => [ADDR]);
  els["latestMelodiesBtn"].click();
  await sleep(30);
  ok(M.isPlaying(), "latest-melodies playback starts (grand arrangement)");
  M.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
