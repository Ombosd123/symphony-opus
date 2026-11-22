// Uji menyeluruh SYMPHONY fase 1 di EVM lokal (ganache in-process).
// Menguji: PreludeRegistry (gate Agent ID, soulbound, 1x selamanya,
// hitungan historis, burn holder, tutup di registrationEnd),
// Soundcheck (gate, 1x/hari UTC, streak naik/putus/reset, repair tepat
// 1 hari + split 0,05/0,05, badge di hari yang benar, Magnum + bind
// market satu-kali + transfer hanya via market, batas musim keras,
// nasib bagian pool: sapu saat lulus & klaim-kembali saat gagal),
// TreasuryVault (claim hanya claimer immutable).
// Pola harness yang sama dengan proyek sebelumnya.
// Jalankan: node test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { ethers } from "ethers";
import Ganache from "ganache";

const root = dirname(fileURLToPath(import.meta.url));
const GL = { gasLimit: 600_000 };
const DAY = 86400;

// ---------- kompilasi in-memory (kontrak + mock) ----------
function compileAll() {
  const files = {
    "PreludeRegistry.sol": join(root, "contracts", "PreludeRegistry.sol"),
    "Soundcheck.sol": join(root, "contracts", "Soundcheck.sol"),
    "TreasuryVault.sol": join(root, "contracts", "TreasuryVault.sol"),
    "MockAgentId.sol": join(root, "mocks", "MockAgentId.sol"),
    "MockUSDT.sol": join(root, "mocks", "MockUSDT.sol"),
  };
  const sources = {};
  for (const [name, path] of Object.entries(files)) {
    sources[name] = { content: readFileSync(path, "utf8") };
  }
  const input = {
    language: "Solidity",
    sources,
    settings: {
      evmVersion: "paris",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errs.length) {
    console.error(errs.map((e) => e.formattedMessage).join("\n"));
    process.exit(1);
  }
  const get = (file, name) => out.contracts[file][name];
  return {
    PreludeRegistry: get("PreludeRegistry.sol", "PreludeRegistry"),
    Soundcheck: get("Soundcheck.sol", "Soundcheck"),
    TreasuryVault: get("TreasuryVault.sol", "TreasuryVault"),
    MockAgentId: get("MockAgentId.sol", "MockAgentId"),
    MockUSDT: get("MockUSDT.sol", "MockUSDT"),
  };
}

// ---------- harness ----------
let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  GAGAL: ${label}`);
  }
}
function eq(actual, expected, label) {
  ok(actual === expected, `${label} (dapat ${actual}, harap ${expected})`);
}
async function expectRevert(method, args, substr, label) {
  try {
    await method.staticCall(...args);
    failed++;
    console.error(`  GAGAL (tidak revert): ${label}`);
  } catch (e) {
    let text = [e.message, e.reason, e.info?.error?.message].filter(Boolean).join(" | ");
    const rd = e.info?.error?.data?.result ?? (typeof e.data === "string" ? e.data : null);
    if (rd && rd.startsWith("0x08c379a0")) {
      try {
        text += " " + ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + rd.slice(10))[0];
      } catch {}
    }
    ok(text.includes(substr), `${label} — revert tanpa teks '${substr}': ${text.slice(0, 200)}`);
  }
}

// ---------- setup ----------
const C = compileAll();
const ganache = Ganache.provider({
  wallet: { totalAccounts: 30, defaultBalance: 1000 },
  logging: { quiet: true },
});
const provider = new ethers.BrowserProvider(ganache);
const signers = [];
for (let i = 0; i < 30; i++) signers.push(await provider.getSigner(i));
const addrs = await Promise.all(signers.map((s) => s.getAddress()));
const deployer = signers[0];
const A = signers[1], B = signers[2], Cc = signers[3], D = signers[4]; // D: tanpa Agent ID
const claimer = signers[9], market = signers[10], sale = signers[11], poolR = signers[12];
const TREASURY_PROD = "0x06509A5D9496A3Bfc996495c53AAA57515ca569e";

async function deploy(compiled, signer, ...args) {
  const f = new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, signer);
  // Batas deploy longgar: creation PreludeRegistry terukur ±788k gas
  // (string konstan URI + string revert di init code) — di atas GL biasa.
  const c = await f.deploy(...args, { gasLimit: 3_000_000 });
  await c.waitForDeployment();
  return c;
}

// Samakan waktu rantai ke tengah malam UTC berikutnya sebagai "hari 0".
const blk = await provider.getBlock("latest");
const BASE = (Math.floor(blk.timestamp / DAY) + 1) * DAY;
await provider.send("evm_increaseTime", [BASE - blk.timestamp]);
await provider.send("evm_mine", []);
let curDay = 0;
async function advanceDays(n) {
  await provider.send("evm_increaseTime", [n * DAY]);
  await provider.send("evm_mine", []);
  curDay += n;
}
const tsOf = (dayOffset) => BASE + dayOffset * DAY;

const registry = await deploy(C.MockAgentId, deployer);
const usdt = await deploy(C.MockUSDT, deployer);
await registry.giveMany([addrs[1], addrs[2], addrs[3], addrs[9], addrs[10], addrs[11], addrs[12]], GL);

// ================= PRELUDE =================
console.log("— PreludeRegistry —");
const REG_END = tsOf(40);
const prelude = await deploy(C.PreludeRegistry, deployer, await registry.getAddress(), REG_END);
eq(Number(await prelude.registrationEnd()), REG_END, "registrationEnd sesuai konstruktor");
eq(Number(await prelude.count()), 0, "count awal 0");

await expectRevert(prelude.connect(D).register, [], "not an Agent ID holder", "register tanpa Agent ID revert");
await prelude.connect(A).register(GL);
eq(Number(await prelude.count()), 1, "count 1 setelah A daftar");
ok(await prelude.hasPass(addrs[1]), "A hasPass");
ok(await prelude.isRegistered(addrs[1]), "A isRegistered");
eq(Number(await prelude.balanceOf(addrs[1])), 1, "balanceOf A = 1");
const passId = Number(await prelude.passOf(addrs[1]));
eq(await prelude.ownerOf(passId), addrs[1], "ownerOf pass A");
ok((await prelude.tokenURI(passId)).endsWith("prelude.json"), "tokenURI prelude.json");
await expectRevert(prelude.connect(A).register, [], "already registered", "register dua kali revert");
await expectRevert(prelude.connect(A).transferFrom, [addrs[1], addrs[2], passId], "soulbound", "transferFrom pass revert (soulbound)");
await expectRevert(prelude.connect(A).approve, [addrs[2], passId], "soulbound", "approve pass revert (soulbound)");
await expectRevert(prelude.connect(B).burn, [passId], "not the holder", "burn oleh bukan holder revert");
await prelude.connect(B).register(GL);
eq(Number(await prelude.count()), 2, "count 2 setelah B daftar");
await prelude.connect(A).burn(passId, GL);
ok(!(await prelude.hasPass(addrs[1])), "hasPass A false setelah burn");
ok(await prelude.isRegistered(addrs[1]), "isRegistered A tetap true setelah burn");
eq(Number(await prelude.count()), 2, "count TIDAK berkurang oleh burn");
await expectRevert(prelude.connect(A).register, [], "already registered", "register ulang setelah burn tetap revert (1x selamanya)");

// ================= PRELUDE — referal fase 1 =================
console.log("— PreludeRegistry: referal fase 1 (registerRef) —");
const E = signers[5], F = signers[6], G = signers[7], H = signers[8];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
await registry.giveMany([addrs[5], addrs[6], addrs[7], addrs[8]], GL);
await expectRevert(prelude.connect(F).registerRef, [addrs[7]], "referrer not registered", "registerRef: referrer belum terdaftar revert");
await expectRevert(prelude.connect(A).registerRef, [addrs[1]], "self-referral", "registerRef: self-referral revert");
await expectRevert(prelude.connect(H).registerRef, [ZERO_ADDR], "referrer zero address", "registerRef: referrer alamat nol revert");
await prelude.connect(E).register(GL);
eq(await prelude.referrerOf(addrs[5]), ZERO_ADDR, "register() biasa: referrerOf tetap kosong");
eq(Number(await prelude.referralCount(addrs[5])), 0, "referralCount E = 0 sebelum membawa siapa pun");
const txF = await prelude.connect(F).registerRef(addrs[5], GL);
const rcF = await txF.wait();
const evF = rcF.logs
  .map((l) => { try { return prelude.interface.parseLog(l); } catch { return null; } })
  .find((p) => p && p.name === "Registered");
ok(!!evF, "event Registered terbit dari registerRef");
eq(evF?.args.user, addrs[6], "event Registered: user = pendaftar F");
eq(evF?.args.referrer, addrs[5], "event Registered: memuat referrer E");
eq(await prelude.referrerOf(addrs[6]), addrs[5], "registerRef mencatat referrerOf F = E");
eq(Number(await prelude.referralCount(addrs[5])), 1, "referralCount E = 1 setelah F");
await prelude.connect(G).registerRef(addrs[5], GL);
eq(Number(await prelude.referralCount(addrs[5])), 2, "referralCount E = 2 setelah G");
eq(Number(await prelude.count()), 5, "count 5 setelah blok referal (A, B, E, F, G)");
await expectRevert(prelude.connect(F).registerRef, [addrs[5]], "already registered", "registerRef setelah sudah terdaftar revert");

// ================= TREASURY VAULT =================
console.log("— TreasuryVault —");
const vault = await deploy(C.TreasuryVault, deployer, addrs[9]);
eq(await vault.claimer(), addrs[9], "claimer sesuai konstruktor");
const vaultProd = await deploy(C.TreasuryVault, deployer, TREASURY_PROD);
eq(await vaultProd.claimer(), TREASURY_PROD, "vault produksi: claimer = wallet treasury");
await usdt.mint(addrs[0], ethers.parseEther("10"), GL);
await usdt.transfer(await vault.getAddress(), ethers.parseEther("4"), GL);
eq(await usdt.balanceOf(await vault.getAddress()), ethers.parseEther("4"), "vault menampung 4 USDT");
await expectRevert(vault.connect(A).claim, [await usdt.getAddress(), ethers.parseEther("1")], "not the claimer", "claim oleh bukan claimer revert");
await expectRevert(vault.connect(claimer).claim, [await usdt.getAddress(), ethers.parseEther("5")], "insufficient balance", "claim melebihi saldo revert");
await vault.connect(claimer).claim(await usdt.getAddress(), ethers.parseEther("1.5"), GL);
eq(await usdt.balanceOf(addrs[9]), ethers.parseEther("1.5"), "claimer menerima claim sebagian 1,5");
await vault.connect(claimer).claimAll(await usdt.getAddress(), GL);
eq(await usdt.balanceOf(addrs[9]), ethers.parseEther("4"), "claimAll mengosongkan vault ke claimer");
await expectRevert(vault.connect(claimer).claimAll, [await usdt.getAddress()], "empty", "claimAll saat kosong revert");

// ================= SOUNDCHECK — streak & badge =================
console.log("— Soundcheck: streak & badge —");
// Peta produksi (skema vonis tanggal tetap, 2026-11-22):
// buka sale 1797076800 (12 Des 2026 12:00 UTC) + 18 hari = vonis
// 1798632000 (30 Des 2026 12:00 UTC). Di harness: REG_END = tsOf(40)
// mewakili buka sale, jadi akhir musim produksi = tsOf(58).
ok(1797076800 + 18 * 86400 === 1798632000, "timestamp vonis produksi 1798632000 = buka sale + 18 hari");
const sc = await deploy(
  C.Soundcheck, deployer,
  await registry.getAddress(), await usdt.getAddress(), await vault.getAddress(), tsOf(58)
);
eq(Number(await sc.seasonEnd()), tsOf(58), "seasonEnd sc = vonis (peta produksi 1798632000, 30 Des 2026 12:00 UTC)");
await expectRevert(sc.connect(D).checkIn, [], "not an Agent ID holder", "checkIn tanpa Agent ID revert");

// A: 14 hari berurutan → semua badge + Magnum
for (let d = 0; d < 14; d++) {
  if (d > 0) await advanceDays(1);
  await sc.connect(A).checkIn(GL);
  eq(Number(await sc.streakOf(addrs[1])), d + 1, `streak A hari ke-${d + 1}`);
  if (d === 0) ok(Number(await sc.badgeOf(addrs[1], 1)) > 0, "FIRST NOTE terbit di streak 1");
  if (d === 1) eq(Number(await sc.badgeOf(addrs[1], 2)), 0, "TUNING belum terbit di streak 2");
  if (d === 2) ok(Number(await sc.badgeOf(addrs[1], 2)) > 0, "TUNING terbit di streak 3");
  if (d === 6) ok(Number(await sc.badgeOf(addrs[1], 3)) > 0, "REHEARSAL terbit di streak 7");
  if (d === 12) {
    eq(Number(await sc.badgeOf(addrs[1], 4)), 0, "FULL SCORE belum terbit di streak 13");
    ok(!(await sc.hasMagnum(addrs[1])), "Magnum belum ada di streak 13");
  }
}
ok(Number(await sc.badgeOf(addrs[1], 4)) > 0, "FULL SCORE terbit di streak 14");
ok(await sc.hasMagnum(addrs[1]), "OPUS MAGNUM terbit di streak 14");
eq(Number(await sc.balanceOf(addrs[1])), 5, "A memegang 5 NFT (4 badge + Magnum)");
const magnumId = Number(await sc.badgeOf(addrs[1], 5));
ok((await sc.tokenURI(magnumId)).endsWith("opus-magnum.json"), "tokenURI Magnum");
const badge1Id = Number(await sc.badgeOf(addrs[1], 1));
ok((await sc.tokenURI(badge1Id)).endsWith("badge-first-note.json"), "tokenURI FIRST NOTE");
await expectRevert(sc.connect(A).checkIn, [], "already checked in today", "checkIn dua kali sehari revert");

// Badge soulbound & Magnum sebelum bind
await expectRevert(sc.connect(A).transferFrom, [addrs[1], addrs[2], badge1Id], "soulbound badge", "transfer badge milestone revert");
await expectRevert(sc.connect(A).transferFrom, [addrs[1], addrs[2], magnumId], "market not bound yet", "transfer Magnum sebelum bindMarket revert");
await expectRevert(sc.connect(A).burn, [badge1Id], "milestone badges cannot be burned", "burn badge milestone revert");

// B: streak, bolong 1 hari, repair
console.log("— Soundcheck: repair —");
await sc.connect(B).checkIn(GL); // hari 13 (curDay=13): streak 1
await advanceDays(1); // hari 14
await sc.connect(B).checkIn(GL); // streak 2
eq(Number(await sc.streakOf(addrs[2])), 2, "streak B = 2");
await advanceDays(2); // hari 16 — kemarin (15) bolong tepat 1 hari
await usdt.mint(addrs[2], ethers.parseEther("1"), GL);
await usdt.connect(B).approve(await sc.getAddress(), ethers.parseEther("0.1"), GL);
const vaultBefore = await usdt.balanceOf(await vault.getAddress());
await sc.connect(B).repairStreak(GL);
eq(Number(await sc.streakOf(addrs[2])), 3, "repair: streak B 2 → 3 (hari bolong terhitung)");
ok(Number(await sc.badgeOf(addrs[2], 2)) > 0, "repair ke streak 3 menerbitkan TUNING");
eq(await usdt.balanceOf(await vault.getAddress()), vaultBefore + ethers.parseEther("0.05"), "0,05 USDT perbaikan masuk TreasuryVault");
eq(await sc.poolSharePaid(addrs[2]), ethers.parseEther("0.05"), "poolSharePaid B = 0,05");
eq(await usdt.balanceOf(await sc.getAddress()), ethers.parseEther("0.05"), "kontrak menahan 0,05 bagian pool");
await sc.connect(B).checkIn(GL); // hari yang sama setelah repair
eq(Number(await sc.streakOf(addrs[2])), 4, "checkIn setelah repair melanjutkan streak ke 4");
await expectRevert(sc.connect(B).repairStreak, [], "exactly one missed day", "repair tanpa bolong revert");

// C: bolong 2 hari → repair revert; checkIn = reset ke 1
console.log("— Soundcheck: reset & bolong >1 —");
await sc.connect(Cc).checkIn(GL); // hari 16: streak 1
await advanceDays(3); // hari 19 — bolong 2 hari (17, 18)
await expectRevert(sc.connect(Cc).repairStreak, [], "exactly one missed day", "repair bolong 2 hari revert");
await sc.connect(Cc).checkIn(GL);
eq(Number(await sc.streakOf(addrs[3])), 1, "checkIn setelah bolong 2 hari = reset streak ke 1");
await expectRevert(sc.connect(D).repairStreak, [], "not an Agent ID holder", "repair tanpa Agent ID revert");

// Magnum: bind market satu-kali & transfer hanya via market
console.log("— Soundcheck: Magnum & market —");
await expectRevert(sc.connect(A).bindMarket, [addrs[10]], "not the deployer", "bindMarket oleh bukan deployer revert");
await sc.bindMarket(addrs[10], GL);
await expectRevert(sc.bindMarket, [addrs[10]], "already bound", "bindMarket kedua revert");
await expectRevert(sc.connect(A).transferFrom, [addrs[1], addrs[2], magnumId], "only the official market", "transfer Magnum oleh holder langsung tetap revert");
await sc.connect(market).transferFrom(addrs[1], addrs[2], magnumId, GL);
ok(await sc.hasMagnum(addrs[2]), "Magnum berpindah ke B lewat market");
ok(!(await sc.hasMagnum(addrs[1])), "A tidak lagi memegang Magnum");
await expectRevert(sc.connect(A).burn, [magnumId], "not the holder", "burn Magnum oleh mantan holder revert");
await sc.connect(B).burn(magnumId, GL);
ok(!(await sc.hasMagnum(addrs[2])), "Magnum ter-burn oleh holder barunya");
ok(await sc.magnumMinted(addrs[1]), "magnumMinted A tetap tercatat (sekali selamanya)");

// Hasil akhir bagian pool: bind sale + markGraduated menyapu ke pool
console.log("— Soundcheck: outcome lulus —");
await expectRevert(sc.connect(A).claimPoolShareRefund, [], "sale did not fail", "klaim refund pool sebelum outcome revert");
await expectRevert(sc.markGraduated, [addrs[12]], "not the sale", "markGraduated sebelum bindSale revert");
await sc.bindSale(addrs[11], GL);
await expectRevert(sc.connect(A).markGraduated, [addrs[12]], "not the sale", "markGraduated oleh bukan sale revert");
const poolBefore = await usdt.balanceOf(addrs[12]);
await sc.connect(sale).markGraduated(addrs[12], GL);
eq(await usdt.balanceOf(addrs[12]), poolBefore + ethers.parseEther("0.05"), "bagian pool disapu ke pool saat graduation");
eq(await usdt.balanceOf(await sc.getAddress()), 0n, "kontrak kosong setelah sapu");
await expectRevert(sc.connect(A).checkIn, [], "season ended at graduation", "checkIn setelah graduation revert");

// ================= SOUNDCHECK 2 — jalur gagal =================
console.log("— Soundcheck 2: outcome gagal & refund pool share —");
const sc2 = await deploy(
  C.Soundcheck, deployer,
  await registry.getAddress(), await usdt.getAddress(), await vault.getAddress(), tsOf(58)
);
await sc2.connect(B).checkIn(GL);
await advanceDays(2); // bolong tepat 1 hari
await usdt.connect(B).approve(await sc2.getAddress(), ethers.parseEther("0.1"), GL);
await sc2.connect(B).repairStreak(GL);
eq(await sc2.poolSharePaid(addrs[2]), ethers.parseEther("0.05"), "sc2 poolSharePaid B = 0,05");
await sc2.bindSale(addrs[11], GL);
const REFUND_DEADLINE = tsOf(curDay + 14);
await sc2.connect(sale).markFailed(REFUND_DEADLINE, GL);
const bBefore = await usdt.balanceOf(addrs[2]);
await sc2.connect(B).claimPoolShareRefund(GL);
eq(await usdt.balanceOf(addrs[2]), bBefore + ethers.parseEther("0.05"), "klaim-kembali bagian pool utuh 0,05 saat sale gagal");
eq(await sc2.poolSharePaid(addrs[2]), 0n, "poolSharePaid B nol setelah klaim");
await expectRevert(sc2.connect(B).claimPoolShareRefund, [], "nothing to refund", "klaim refund dua kali revert");

// ================= SOUNDCHECK 3 — batas musim keras =================
console.log("— Soundcheck 3: batas musim —");
const sc3 = await deploy(
  C.Soundcheck, deployer,
  await registry.getAddress(), await usdt.getAddress(), await vault.getAddress(), tsOf(curDay + 1)
);
await sc3.connect(A).checkIn(GL);
await advanceDays(2); // melewati seasonEnd sc3
await expectRevert(sc3.connect(A).checkIn, [], "season over", "checkIn setelah batas keras musim revert");
await expectRevert(sc3.connect(A).repairStreak, [], "season over", "repair setelah batas keras musim revert");

// ================= PRELUDE — tutup registrasi =================
console.log("— Prelude: tutup di registrationEnd —");
await advanceDays(40 - curDay + 1); // melewati REG_END (hari ke-40)
await expectRevert(prelude.connect(Cc).register, [], "registration closed", "register setelah 12 Des 12:00 UTC revert");

console.log(`\nTOTAL: ${passed + failed} asersi — LULUS ${passed}, GAGAL ${failed}`);
process.exit(failed > 0 ? 1 : 0);
