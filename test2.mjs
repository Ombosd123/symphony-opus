// Uji menyeluruh SYMPHONY fase 2 di EVM lokal (ganache in-process).
// Tiga skenario tumpukan kontrak penuh (pola test.mjs fase 1):
//   A — jalur LULUS: gerbang 500 + gerbang tanggal, jendela 48 jam
//       Prelude, tier & batas tier, referral sale, presale (buka tepat
//       di totalSold 1.500, cap, split), market (lantai 80%, fee 5%,
//       gate pembeli, Magnum), habis lebih awal tetap terkunci sampai
//       vonis, finalize di vonis (pool V2, LP bakar, treasury 10%,
//       sapuan Soundcheck, bakar sisa referral), klaim Premiere /
//       Encore (50/50 + vesting + bonus cap + sisa dibakar + kursi +
//       kunci SCHERZO soulbound: satu per wallet, terbit di Encore
//       pertama — amendemen 2026-11-22),
//       distributor Merkle (3 kolam + burn-to-claim + sisa dibakar),
//       vesting tim (cliff 30 hari, linear, lunas hari ke-395).
//   B — jalur GAGAL: finalize gagal di vonis, refund burn-to-settle
//       dalam jendela (dan revert setelahnya), market tutup & listing
//       kembali, presale refund + OPUS tak terjual ke vesting,
//       Soundcheck markFailed + klaim pool share, distributor dibakar.
//   C — gerbang 500 belum terpenuhi saat 12 Des: buy revert; setelah
//       pendaftar ke-500 masuk, sale membuka (openedAt terpatri) dan
//       jendela 48 jam berjalan dari openedAt.
// Jalankan: node test2.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { ethers } from "ethers";
import Ganache from "ganache";

const root = dirname(fileURLToPath(import.meta.url));
const GL = { gasLimit: 600_000 };
const GL_BIG = { gasLimit: 6_000_000 };
const DAY = 86400;
const E = (n) => ethers.parseEther(String(n));

// ---------- kompilasi in-memory (kontrak fase 1 + 2 + mock) ----------
function compileAll() {
  const files = {
    "PreludeRegistry.sol": join(root, "contracts", "PreludeRegistry.sol"),
    "Soundcheck.sol": join(root, "contracts", "Soundcheck.sol"),
    "TreasuryVault.sol": join(root, "contracts", "TreasuryVault.sol"),
    "OpusToken.sol": join(root, "contracts", "OpusToken.sol"),
    "SymphonyPass.sol": join(root, "contracts", "SymphonyPass.sol"),
    "SymphonySale.sol": join(root, "contracts", "SymphonySale.sol"),
    "SymphonyMarket.sol": join(root, "contracts", "SymphonyMarket.sol"),
    "TeamVesting.sol": join(root, "contracts", "TeamVesting.sol"),
    "OpusDistributor.sol": join(root, "contracts", "OpusDistributor.sol"),
    "OpusPresale.sol": join(root, "contracts", "OpusPresale.sol"),
    "ScherzoKey.sol": join(root, "contracts", "ScherzoKey.sol"),
    "MockAgentId.sol": join(root, "mocks", "MockAgentId.sol"),
    "MockUSDT.sol": join(root, "mocks", "MockUSDT.sol"),
    "MockPancake.sol": join(root, "mocks", "MockPancake.sol"),
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
    OpusToken: get("OpusToken.sol", "OpusToken"),
    SymphonyPass: get("SymphonyPass.sol", "SymphonyPass"),
    SymphonySale: get("SymphonySale.sol", "SymphonySale"),
    SymphonyMarket: get("SymphonyMarket.sol", "SymphonyMarket"),
    TeamVesting: get("TeamVesting.sol", "TeamVesting"),
    OpusDistributor: get("OpusDistributor.sol", "OpusDistributor"),
    OpusPresale: get("OpusPresale.sol", "OpusPresale"),
    ScherzoKey: get("ScherzoKey.sol", "ScherzoKey"),
    MockAgentId: get("MockAgentId.sol", "MockAgentId"),
    MockUSDT: get("MockUSDT.sol", "MockUSDT"),
    MockFactory: get("MockPancake.sol", "MockFactory"),
    MockRouter: get("MockPancake.sol", "MockRouter"),
    MockPair: get("MockPancake.sol", "MockPair"),
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
function closeTo(actual, expected, tol, label) {
  const d = actual > expected ? actual - expected : expected - actual;
  ok(d <= tol, `${label} (dapat ${actual}, harap ±${tol} dari ${expected})`);
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

// ---------- Merkle (pola OpenZeppelin: daun hash ganda, pasangan terurut) ----------
function leafOf(account, amount) {
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, amount])
  );
  return ethers.keccak256(inner);
}
function hashPair(a, b) {
  return a < b ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a]));
}
function buildTree(entries) {
  const leaves = entries.map((e) => leafOf(e.account, e.amount));
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers, leaves };
}
function proofOf(tree, account, amount) {
  let idx = tree.leaves.indexOf(leafOf(account, amount));
  if (idx < 0) throw new Error("leaf tidak ada di tree");
  const proof = [];
  for (let l = 0; l < tree.layers.length - 1; l++) {
    const layer = tree.layers[l];
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sib < layer.length) proof.push(layer[sib]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

// ---------- setup ----------
const C = compileAll();
const ganache = Ganache.provider({
  wallet: { totalAccounts: 1150, defaultBalance: 1000 },
  logging: { quiet: true },
});
const provider = new ethers.BrowserProvider(ganache);
const signers = [];
for (let i = 0; i < 1150; i++) signers.push(await provider.getSigner(i));
const addrs = await Promise.all(signers.map((s) => s.getAddress()));
const deployer = signers[0];
const treasury = signers[1]; // claimer vault + penerima vesting tim
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function deploy(compiled, signer, ...args) {
  const f = new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, signer);
  const c = await f.deploy(...args, { gasLimit: 8_000_000 });
  await c.waitForDeployment();
  return c;
}

const blk = await provider.getBlock("latest");
const BASE = (Math.floor(blk.timestamp / DAY) + 1) * DAY;
await provider.send("evm_increaseTime", [BASE - blk.timestamp]);
await provider.send("evm_mine", []);
let curDay = 0;
let scenarioStart = 0; // hari absolut awal skenario berjalan (tsOf relatif terhadap ini)
async function advanceDays(n) {
  await provider.send("evm_increaseTime", [n * DAY]);
  await provider.send("evm_mine", []);
  curDay += n;
}
async function advanceTo(day) {
  if (day > curDay) await advanceDays(day - curDay);
}
const tsOf = (dayOffset) => BASE + (scenarioStart + dayOffset) * DAY;
// Panggil di awal skenario baru: jam rantai sudah berjalan sejauh skenario
// sebelumnya; jadikan titik itu hari 0 skenario ini.
function newScenario() {
  scenarioStart += curDay;
  curDay = 0;
}

const registry = await deploy(C.MockAgentId, deployer);
const usdt = await deploy(C.MockUSDT, deployer);
const registryAddr = await registry.getAddress();
const usdtAddr = await usdt.getAddress();

async function giveAgentIds(list) {
  for (let i = 0; i < list.length; i += 100) {
    await registry.giveMany(list.slice(i, i + 100), GL_BIG);
  }
}
async function fundUsdt(signer, amount) {
  await usdt.mint(await signer.getAddress(), amount, GL);
}
async function approveMax(signer, spenderAddr) {
  await usdt.connect(signer).approve(spenderAddr, ethers.MaxUint256, GL);
}

// Deploy satu tumpukan penuh fase 1 + fase 2 dan lakukan semua bind.
async function deployStack({ regEnd, saleStart, verdict }) {
  const vault = await deploy(C.TreasuryVault, deployer, addrs[1]);
  const prelude = await deploy(C.PreludeRegistry, deployer, registryAddr, regEnd);
  const sc = await deploy(C.Soundcheck, deployer, registryAddr, usdtAddr, await vault.getAddress(), verdict);
  const pass = await deploy(C.SymphonyPass, deployer);
  const factory = await deploy(C.MockFactory, deployer);
  const router = await deploy(C.MockRouter, deployer, await factory.getAddress());
  const sale = await deploy(
    C.SymphonySale, deployer,
    registryAddr, usdtAddr, await prelude.getAddress(), await sc.getAddress(),
    await vault.getAddress(), await pass.getAddress(),
    await factory.getAddress(), await router.getAddress(), saleStart, verdict
  );
  const market = await deploy(
    C.SymphonyMarket, deployer,
    registryAddr, usdtAddr, await vault.getAddress(), await pass.getAddress(),
    await sc.getAddress(), saleStart, verdict
  );
  const vesting = await deploy(C.TeamVesting, deployer, addrs[1], await sale.getAddress());
  const presale = await deploy(
    C.OpusPresale, deployer,
    registryAddr, usdtAddr, await sale.getAddress(), await vault.getAddress(),
    await vesting.getAddress(), verdict
  );
  const distributor = await deploy(
    C.OpusDistributor, deployer,
    await prelude.getAddress(), await sc.getAddress(), await sale.getAddress()
  );
  const scherzoKey = await deploy(C.ScherzoKey, deployer);
  const opus = await deploy(
    C.OpusToken, deployer,
    await sale.getAddress(), await distributor.getAddress(),
    await vesting.getAddress(), await presale.getAddress()
  );
  const saleAddr = await sale.getAddress();
  const marketAddr = await market.getAddress();
  await pass.bindSale(saleAddr, GL);
  await pass.bindMarket(marketAddr, GL);
  await sc.bindMarket(marketAddr, GL);
  await sc.bindSale(saleAddr, GL);
  await sale.bindPresale(await presale.getAddress(), GL);
  await sale.bindToken(await opus.getAddress(), GL);
  await presale.bindToken(await opus.getAddress(), GL);
  await vesting.bindToken(await opus.getAddress(), GL);
  await distributor.bindToken(await opus.getAddress(), GL);
  await scherzoKey.bindSale(saleAddr, GL);
  await sale.bindScherzoKey(await scherzoKey.getAddress(), GL);
  return { vault, prelude, sc, pass, factory, router, sale, market, vesting, presale, distributor, opus, scherzoKey };
}

// ======================================================================
// SKENARIO A — jalur LULUS
// ======================================================================
console.log("— Skenario A: persiapan —");
const SALE_START_A = tsOf(40), VERDICT_A = tsOf(58);
const A = await deployStack({ regEnd: SALE_START_A, saleStart: SALE_START_A, verdict: VERDICT_A });
const regsA = signers.slice(10, 510); // 500 pendaftar
const regA = (i) => signers[10 + i];
const hub = signers[8];
const flockA = signers.slice(520, 575); // 55 orang dibawa hub
const presaleBuyer1 = signers[2], presaleBuyer2 = signers[3];
const marketBuyer = signers[4], nonReg = signers[5], noAgent = signers[6], anyone = signers[7];

await giveAgentIds([
  addrs[2], addrs[3], addrs[4], addrs[5], addrs[7], addrs[8], addrs[9], // BUKAN addrs[6] (noAgent)
  ...addrs.slice(10, 510),
  ...addrs.slice(520, 575),
]);

// Alokasi token tercetak sekali (SPEC 6)
eq(await A.opus.balanceOf(await A.sale.getAddress()), E(530_000_000), "A: sale memegang 530 jt OPUS");
eq(await A.opus.balanceOf(await A.distributor.getAddress()), E(50_000_000), "A: distributor memegang 50 jt");
eq(await A.opus.balanceOf(await A.vesting.getAddress()), E(15_000_000), "A: vesting memegang 15 jt");
eq(await A.opus.balanceOf(await A.presale.getAddress()), E(5_000_000), "A: presale memegang 5 jt");
eq(await A.opus.totalSupply(), E(600_000_000), "A: total pasokan 600 jt");

// Kunci SCHERZO (amendemen keputusan 2026-11-22 ~13:59): identitas,
// bind satu-kali dua arah, dan mint hanya oleh kontrak sale.
eq(await A.scherzoKey.name(), "SCHERZO — Season 2 Seat Key", "A: nama ERC-721 kunci SCHERZO");
eq(await A.scherzoKey.symbol(), "SCHERZO", "A: simbol kunci SCHERZO");
eq(Number(await A.scherzoKey.totalKeys()), 0, "A: belum ada kunci sebelum ada klaim Encore");
await expectRevert(A.scherzoKey.connect(anyone).mintKey, [addrs[7]], "only the sale", "A: mintKey oleh non-sale revert");
await expectRevert(A.scherzoKey.bindSale, [addrs[7]], "sale already bound", "A: bindSale di kontrak kunci hanya sekali");
await expectRevert(A.sale.bindScherzoKey, [addrs[7]], "key already bound", "A: bindScherzoKey di sale hanya sekali");
await expectRevert(A.scherzoKey.tokenURI, [1], "nonexistent token", "A: tokenURI kunci yang belum terbit revert");

// Registrasi Prelude: hub & reg10 polos; reg11 via registerRef(reg10);
// 55 flock via registerRef(hub); sisanya polos. Total 556 ≥ 500.
await A.prelude.connect(hub).register(GL);
await A.prelude.connect(regA(10)).register(GL);
await A.prelude.connect(regA(11)).registerRef(addrs[20], GL); // referrer = reg10 (signers[20])
for (const s of flockA) await A.prelude.connect(s).registerRef(addrs[8], GL);
for (let i = 0; i < 500; i++) {
  if (i === 10 || i === 11) continue;
  await A.prelude.connect(regA(i)).register(GL);
}
eq(Number(await A.prelude.count()), 556, "A: 556 pendaftar Prelude (≥ 500)");
eq(Number(await A.prelude.referralCount(addrs[8])), 55, "A: referralCount hub = 55 (mentah)");
eq(Number(await A.prelude.referralCount(addrs[20])), 1, "A: referralCount reg10 = 1");

// Gerbang tanggal: count sudah ≥ 500 tapi sebelum 12 Des buy revert.
await fundUsdt(regA(0), E(100));
await approveMax(regA(0), await A.sale.getAddress());
await expectRevert(A.sale.connect(regA(0)).buy, [1, ZERO], "sale has not started", "A: buy sebelum 12 Des revert (gerbang tanggal)");

// ---------- hari ke-40: sale dibuka ----------
await advanceTo(40);
console.log("— Skenario A: pembukaan & jendela 48 jam —");
const comp1 = regA(1), comp2 = regA(2); // penyelesai Soundcheck
await A.sc.connect(comp1).checkIn(GL);
await A.sc.connect(comp2).checkIn(GL);
await fundUsdt(nonReg, E(100));
await approveMax(nonReg, await A.sale.getAddress());
await expectRevert(A.sale.connect(nonReg).buy, [1, ZERO], "Prelude registrants only", "A: non-pendaftar ditolak di 48 jam pertama");
await expectRevert(A.sale.connect(noAgent).buy, [1, ZERO], "not an Agent ID holder", "A: tanpa Agent ID ditolak");

const mintedOf = async (receipt, passContract) => {
  const ids = [];
  for (const log of receipt.logs) {
    try {
      const p = passContract.interface.parseLog(log);
      if (p && p.name === "PassMinted") ids.push(Number(p.args.tokenId));
    } catch {}
  }
  return ids;
};
const boughtA = new Set();
async function buyA(signer, count, referrer = ZERO) {
  const addr = await signer.getAddress();
  if (!boughtA.has(addr)) {
    await fundUsdt(signer, E(100));
    await approveMax(signer, await A.sale.getAddress());
    boughtA.add(addr);
  }
  const tx = await A.sale.connect(signer).buy(count, referrer, GL_BIG);
  const receipt = await tx.wait();
  return mintedOf(receipt, A.pass);
}
const idsReg1 = await buyA(comp1, 10);
eq(Number(await A.sale.totalSold()), 10, "A: totalSold 10 setelah pembelian pertama");
ok(Number(await A.sale.openedAt()) > 0, "A: openedAt terpatri pada pembelian pertama");
const idsReg2 = await buyA(comp2, 10, addrs[11]); // referrer = reg1
eq(await A.sale.referralAccrued(addrs[11]), E(50_000), "A: referral terakru 10 × 5.000 untuk reg1");
eq(idsReg1.length, 10, "A: reg1 menerima 10 Pass");
await expectRevert(A.sale.connect(regA(3)).buy, [1, addrs[13]], "self-referral", "A: self-referral revert");
await expectRevert(A.sale.connect(regA(4)).buy, [1, addrs[5]], "referrer holds no Pass", "A: referrer tanpa Pass revert");
const idsReg0 = await buyA(regA(0), 10);
const idsReg5 = await buyA(regA(5), 10);
const idsReg6 = await buyA(regA(6), 10);
const idsReg7 = await buyA(regA(7), 10);
eq(Number(await A.sale.totalSold()), 60, "A: totalSold 60");

// Hari 41–42: check-in berlanjut; nonReg masih ditolak di hari 41.
await advanceTo(41);
await A.sc.connect(comp1).checkIn(GL);
await A.sc.connect(comp2).checkIn(GL);
await expectRevert(A.sale.connect(nonReg).buy, [1, ZERO], "Prelude registrants only", "A: hari ke-41 masih jendela Prelude");
await advanceTo(42);
await A.sc.connect(comp1).checkIn(GL);
// comp2 bolong hari 42 (untuk repair besok)

// Hari 43: repair comp2, jendela publik terbuka, pembelian massal.
await advanceTo(43);
console.log("— Skenario A: publik, tier, presale —");
await usdt.mint(addrs[12], E(1), GL);
await usdt.connect(comp2).approve(await A.sc.getAddress(), E("0.1"), GL);
await A.sc.connect(comp2).repairStreak(GL);
eq(await A.sc.poolSharePaid(addrs[12]), E("0.05"), "A: poolSharePaid comp2 = 0,05");
await A.sc.connect(comp2).checkIn(GL);
await A.sc.connect(comp1).checkIn(GL);
await buyA(nonReg, 10);
eq(Number(await A.sale.primaryPurchases(addrs[5])), 10, "A: non-pendaftar bisa membeli setelah 48 jam");

async function bulkToA(target) {
  for (const s of regsA) {
    if (Number(await A.sale.totalSold()) >= target) break;
    const addr = await s.getAddress();
    const already = Number(await A.sale.primaryPurchases(addr));
    if (already >= 10) continue;
    const room = target - Number(await A.sale.totalSold());
    await buyA(s, Math.min(10 - already, room));
  }
  eq(Number(await A.sale.totalSold()), target, `A: bulkTo(${target}) tercapai`);
}
await bulkToA(1490);
ok(!(await A.presale.isOpen()), "A: presale belum buka di totalSold 1490");
await expectRevert(A.presale.connect(presaleBuyer1).buy, [E(1)], "not open", "A: presale buy sebelum Tier 1 habis revert");
await bulkToA(1500);
ok(await A.presale.isOpen(), "A: presale BUKA tepat di totalSold 1.500");
eq(Number(await A.pass.tierOf(1500)), 1, "A: Pass #1500 = Tier 1");
eq(await A.pass.paidOf(1500), E(1), "A: Pass #1500 paidOf 1 USDT");
// (tierOf #1501 diperiksa setelah pembelian berikutnya — token belum ada)
await fundUsdt(presaleBuyer1, E(100));
await approveMax(presaleBuyer1, await A.presale.getAddress());
await A.presale.connect(presaleBuyer1).buy(E(50), GL);
eq(await A.presale.opusOwedOf(addrs[2]), E(500_000), "A: presale buyer1 berhak 500.000 OPUS");
await expectRevert(A.presale.connect(presaleBuyer1).buy, [E(1)], "wallet cap exceeded", "A: presale cap 50 USDT/wallet ditegakkan");
await fundUsdt(presaleBuyer2, E(100));
await approveMax(presaleBuyer2, await A.presale.getAddress());
await A.presale.connect(presaleBuyer2).buy(E(10), GL);
eq(await A.presale.totalRaised(), E(60), "A: presale totalRaised 60 USDT");
await expectRevert(A.presale.connect(noAgent).buy, [E(1)], "not an Agent ID holder", "A: presale tanpa Agent ID revert");

await bulkToA(3500);
eq(Number(await A.pass.tierOf(1501)), 2, "A: Pass #1501 = Tier 2");
eq(await A.pass.paidOf(1501), E("1.5"), "A: Pass #1501 paidOf 1,5 USDT");
eq(Number(await A.pass.tierOf(3500)), 2, "A: Pass #3500 = Tier 2");
await bulkToA(3501);
eq(Number(await A.pass.tierOf(3501)), 3, "A: Pass #3501 = Tier 3");
eq(await A.pass.paidOf(3501), E(2), "A: Pass #3501 paidOf 2 USDT");

// ---------- market (hari 43, masa sale) ----------
console.log("— Skenario A: market —");
const passReg5 = idsReg5[0];
eq(await A.market.floorOf(passReg5), E("0.8"), "A: lantai Pass T1 = 0,8 USDT");
await expectRevert(A.market.connect(regA(5)).listPass, [passReg5, E("0.79")], "price below floor", "A: listing di bawah lantai revert");
const listTx = await A.market.connect(regA(5)).listPass(passReg5, E("0.8"), GL);
await listTx.wait();
eq(await A.pass.ownerOf(passReg5), await A.market.getAddress(), "A: Pass masuk escrow market");
await fundUsdt(marketBuyer, E(100));
await approveMax(marketBuyer, await A.market.getAddress());
await expectRevert(A.market.connect(noAgent).buy, [1], "not an Agent ID holder", "A: pembeli market tanpa Agent ID revert");
const sellerBefore = await usdt.balanceOf(addrs[15]);
const vaultBefore = await usdt.balanceOf(await A.vault.getAddress());
await A.market.connect(marketBuyer).buy(1, GL);
eq(await usdt.balanceOf(addrs[15]), sellerBefore + E("0.76"), "A: penjual menerima 95% (0,76)");
eq(await usdt.balanceOf(await A.vault.getAddress()), vaultBefore + E("0.04"), "A: fee market 5% (0,04) ke TreasuryVault");
eq(await A.pass.ownerOf(passReg5), addrs[4], "A: Pass berpindah ke pembeli market");
const passReg6 = idsReg6[0];
const listTx2 = await A.market.connect(regA(6)).listPass(passReg6, E(1), GL);
await listTx2.wait();
await A.market.connect(regA(6)).cancel(2, GL);
eq(await A.pass.ownerOf(passReg6), addrs[16], "A: delist mengembalikan Pass ke penjual");

// Check-in comp1/comp2 berlanjut hari 44–53 (comp2 sudah streak 4 di hari 43)
for (let d = 44; d <= 53; d++) {
  await advanceTo(d);
  await A.sc.connect(comp1).checkIn(GL);
  await A.sc.connect(comp2).checkIn(GL);
}
ok(await A.sc.hasMagnum(addrs[11]), "A: comp1 memegang Magnum (streak 14)");
ok(await A.sc.hasMagnum(addrs[12]), "A: comp2 memegang Magnum (dengan 1 repair)");

// Hari 54: Magnum diperdagangkan; penjualan dilengkapi sampai habis.
await advanceTo(54);
const magnumComp2 = Number(await A.sc.badgeOf(addrs[12], 5));
const magListTx = await A.market.connect(comp2).listMagnum(magnumComp2, E(3), GL);
await magListTx.wait();
await A.market.connect(marketBuyer).buy(3, GL);
ok(await A.sc.hasMagnum(addrs[4]), "A: Magnum berpindah ke pembeli market");
ok(!(await A.sc.hasMagnum(addrs[12])), "A: comp2 tidak lagi memegang Magnum");
await bulkToA(5000);
eq(Number(await A.pass.totalMinted()), 5000, "A: 5.000 Pass tercetak");
await fundUsdt(signers[9], E(100));
await approveMax(signers[9], await A.sale.getAddress());
await expectRevert(A.sale.connect(signers[9]).buy, [1, ZERO], "not enough Passes left", "A: buy setelah habis revert");
await expectRevert(A.sale.connect(regA(0)).claimPremiere, [idsReg0[0]], "not graduated", "A: klaim sebelum vonis revert (habis lebih awal tetap terkunci)");
await expectRevert(A.sale.connect(regA(7)).claimEncore, [idsReg7[0]], "not graduated", "A: Encore sebelum vonis revert — kunci tidak bisa terbit sebelum graduation");
eq(Number(await A.scherzoKey.totalKeys()), 0, "A: totalKeys tetap 0 sebelum graduation");
await expectRevert(A.sale.finalize, [], "verdict not reached", "A: finalize sebelum vonis revert");

// ---------- hari ke-58: VONIS — finalize jalur lulus ----------
await advanceTo(58);
console.log("— Skenario A: vonis & graduation —");
await A.sale.connect(anyone).finalize(GL_BIG);
ok(await A.sale.graduated(), "A: sale LULUS di vonis");
const pairAddr = await A.factory.getPair(await A.opus.getAddress(), usdtAddr);
ok(pairAddr !== ZERO, "A: pair PancakeSwap tercipta");
const pair = new ethers.Contract(pairAddr, C.MockPair.abi, provider);
eq(await pair.reserve0(), E(175_000_000), "A: pool berisi 175 jt OPUS");
eq(await pair.reserve1(), E("6804.05"), "A: pool USDT = 6.750 + 54 presale + 0,05 Soundcheck");
eq(await pair.balanceOf(await A.sale.getAddress()), 0n, "A: LP tidak tertinggal di sale");
ok((await pair.balanceOf(DEAD)) > 0n, "A: LP DIBAKAR ke alamat mati");
eq(await usdt.balanceOf(await A.vault.getAddress()), E("756.24"), "A: vault = 750 sale + 6 presale + 0,19 fee market + 0,05 repair");
eq(Number(await A.sc.outcome()), 1, "A: Soundcheck tertanda Graduated");
eq(await usdt.balanceOf(await A.sc.getAddress()), 0n, "A: bagian pool Soundcheck tersapu habis");
eq(await A.opus.totalSupply(), E(575_050_000), "A: sisa referral 24,95 jt dibakar di finalize");

// Presale: selesaikan OPUS tak terjual + klaim pembeli
await A.presale.connect(anyone).settleUnsold(GL);
eq(await A.opus.balanceOf(await A.vesting.getAddress()), E(19_400_000), "A: vesting = 15 jt + 4,4 jt presale tak terjual");
await A.presale.connect(presaleBuyer1).claimOpus(GL);
eq(await A.opus.balanceOf(addrs[2]), E(500_000), "A: presale buyer1 menerima 500.000 OPUS utuh");
await A.presale.connect(presaleBuyer2).claimOpus(GL);
eq(await A.opus.balanceOf(addrs[3]), E(100_000), "A: presale buyer2 menerima 100.000 OPUS");
await expectRevert(A.presale.connect(presaleBuyer1).claimOpus, [], "nothing to claim", "A: klaim presale dua kali revert");

// Klaim sale: referral, Premiere, Encore
await A.sale.connect(comp1).claimReferral(GL);
eq(await A.opus.balanceOf(addrs[11]), E(50_000), "A: reg1 mengklaim referral 50.000 OPUS");
await expectRevert(A.sale.connect(comp1).claimReferral, [], "no referral balance", "A: klaim referral dua kali revert");
await A.sale.connect(regA(0)).claimPremiere(idsReg0[0], GL);
eq(await A.opus.balanceOf(addrs[10]), E(78_000), "A: Premiere Tier 1 membayar 78.000 OPUS");
await expectRevert(A.pass.ownerOf, [idsReg0[0]], "nonexistent token", "A: Pass Premiere ter-burn");
eq(Number(await A.scherzoKey.keyOf(addrs[10])), 0, "A: klaim Premiere TIDAK menerbitkan kunci SCHERZO");
await A.sale.connect(regA(7)).claimEncore(idsReg7[0], GL);
eq(await A.opus.balanceOf(addrs[17]), E(39_000), "A: Encore membayar 50% langsung (39.000)");
eq(Number(await A.sale.scherzoOvertureSeats(addrs[17])), 1, "A: kursi Overture Scherzo tercatat on-chain");
eq(await A.sale.totalEncoreVestedOf(addrs[17]), E(39_000), "A: bagian vesting Encore reg7 = 39.000");
// Kunci SCHERZO reg7: terbit tepat satu pada Encore pertamanya.
eq(Number(await A.scherzoKey.keyOf(addrs[17])), 1, "A: kunci SCHERZO #1 terbit untuk reg7 pada Encore pertamanya");
eq(await A.scherzoKey.ownerOf(1), addrs[17], "A: kunci #1 milik reg7");
ok(await A.scherzoKey.hasKey(addrs[17]), "A: hasKey(reg7) = true");
eq(Number(await A.scherzoKey.balanceOf(addrs[17])), 1, "A: balanceOf kunci reg7 = 1");
eq(Number(await A.scherzoKey.totalKeys()), 1, "A: totalKeys = 1 setelah Encore pertama");
eq(await A.scherzoKey.tokenURI(1), "https://symphony-opus.pages.dev/scherzo-key.json", "A: tokenURI kunci menunjuk metadata di domain situs");
// Soulbound penuh: semua jalur pemindahan & persetujuan revert.
await expectRevert(A.scherzoKey.connect(regA(7)).transferFrom, [addrs[17], addrs[10], 1], "soulbound key", "A: transferFrom kunci revert (soulbound)");
await expectRevert(A.scherzoKey.connect(regA(7))["safeTransferFrom(address,address,uint256)"], [addrs[17], addrs[10], 1], "soulbound key", "A: safeTransferFrom kunci revert (soulbound)");
await expectRevert(A.scherzoKey.connect(regA(7))["safeTransferFrom(address,address,uint256,bytes)"], [addrs[17], addrs[10], 1, "0x"], "soulbound key", "A: safeTransferFrom+data kunci revert (soulbound)");
await expectRevert(A.scherzoKey.connect(regA(7)).approve, [addrs[10], 1], "soulbound key", "A: approve kunci revert (soulbound)");
await expectRevert(A.scherzoKey.connect(regA(7)).setApprovalForAll, [addrs[10], true], "soulbound key", "A: setApprovalForAll kunci revert (soulbound)");
// Kunci SCHERZO reg6: Encore pertama menerbitkan kunci #2; Encore kedua
// (Pass berbeda, wallet sama) TIDAK menerbitkan kunci lagi, tetapi
// klaimnya berhasil persis sama (50% langsung + 50% vesting bertumpuk).
await A.sale.connect(regA(6)).claimEncore(idsReg6[1], GL);
eq(await A.opus.balanceOf(addrs[16]), E(39_000), "A: Encore pertama reg6 membayar 50% langsung (39.000)");
eq(Number(await A.scherzoKey.keyOf(addrs[16])), 2, "A: kunci SCHERZO #2 terbit untuk reg6 pada Encore pertamanya");
eq(Number(await A.scherzoKey.totalKeys()), 2, "A: totalKeys = 2 (dua wallet Encore)");
const opusReg6Before2nd = await A.opus.balanceOf(addrs[16]);
await A.sale.connect(regA(6)).claimEncore(idsReg6[2], GL);
eq((await A.opus.balanceOf(addrs[16])) - opusReg6Before2nd, E(39_000), "A: Encore kedua reg6 membayar 50% langsung yang sama (39.000)");
eq(await A.sale.totalEncoreVestedOf(addrs[16]), E(78_000), "A: vesting Encore reg6 bertumpuk 2 × 39.000");
eq(Number(await A.sale.scherzoOvertureSeats(addrs[16])), 2, "A: catatan internal sale menghitung 2 Pass Encore reg6");
eq(Number(await A.scherzoKey.keyOf(addrs[16])), 2, "A: kunci reg6 TETAP #2 — tidak ada kunci kedua untuk wallet yang sama");
eq(Number(await A.scherzoKey.totalKeys()), 2, "A: totalKeys tetap 2 setelah Encore kedua reg6");
eq(Number(await A.scherzoKey.balanceOf(addrs[16])), 1, "A: balanceOf kunci reg6 tetap 1");

// ---------- distributor (hari 58, di dalam jendela klaim) ----------
console.log("— Skenario A: distributor Merkle —");
const scTree = buildTree([
  { account: addrs[11], amount: E(60_000) }, // comp1
  { account: addrs[4], amount: E(60_000) }, // marketBuyer (pemegang Magnum saat vonis)
]);
await A.distributor.setPool(2, scTree.root, E(120_000), GL);
const refTree = buildTree([
  { account: addrs[20], amount: E(100) }, // reg10: 1 referral × 100
  { account: addrs[8], amount: E(5_000) }, // hub: 55 referral ter-cap 50 × 100
]);
await A.distributor.setPool(1, refTree.root, E(5_100), GL);
const flatTree = buildTree([
  { account: addrs[10], amount: E(14_960_000) },
  { account: addrs[11], amount: E(14_960_000) },
  { account: addrs[12], amount: E(14_960_000) },
]);
await A.distributor.setPool(0, flatTree.root, E(44_880_000), GL);
eq((await A.distributor.pools(0)).entitlement, E(44_880_000), "A: hak pool flat = 15 jt + sisa Soundcheck 29,88 jt");
await expectRevert(A.distributor.setPool, [0, scTree.root, E(1)], "already set", "A: pool tidak bisa di-set dua kali");

// Flat: wajib burn Prelude Pass dulu
const preludePassReg0 = Number(await A.prelude.passOf(addrs[10]));
await expectRevert(
  A.distributor.connect(regA(0)).claim,
  [0, E(14_960_000), proofOf(flatTree, addrs[10], E(14_960_000))],
  "burn your Prelude Pass first",
  "A: klaim flat sebelum burn Prelude Pass revert"
);
await A.prelude.connect(regA(0)).burn(preludePassReg0, GL);
const opusReg0Before = await A.opus.balanceOf(addrs[10]);
await A.distributor.connect(regA(0)).claim(0, E(14_960_000), proofOf(flatTree, addrs[10], E(14_960_000)), GL);
eq(await A.opus.balanceOf(addrs[10]), opusReg0Before + E(14_960_000), "A: klaim flat reg0 membayar 14,96 jt");
await A.prelude.connect(regA(1)).burn(Number(await A.prelude.passOf(addrs[11])), GL);
await A.distributor.connect(regA(1)).claim(0, E(14_960_000), proofOf(flatTree, addrs[11], E(14_960_000)), GL);
await A.prelude.connect(regA(2)).burn(Number(await A.prelude.passOf(addrs[12])), GL);
await A.distributor.connect(regA(2)).claim(0, E(14_960_000), proofOf(flatTree, addrs[12], E(14_960_000)), GL);
// Referral Prelude: tanpa syarat burn
await A.distributor.connect(regA(10)).claim(1, E(100), proofOf(refTree, addrs[20], E(100)), GL);
eq(await A.opus.balanceOf(addrs[20]), E(100), "A: klaim referral Prelude reg10 = 100 OPUS");
// Soundcheck: wajib burn Magnum dulu
await expectRevert(
  A.distributor.connect(comp1).claim,
  [2, E(60_000), proofOf(scTree, addrs[11], E(60_000))],
  "burn your Opus Magnum first",
  "A: klaim Soundcheck sebelum burn Magnum revert"
);
await A.sc.connect(comp1).burn(Number(await A.sc.badgeOf(addrs[11], 5)), GL);
await A.distributor.connect(comp1).claim(2, E(60_000), proofOf(scTree, addrs[11], E(60_000)), GL);
await A.sc.connect(marketBuyer).burn(Number(await A.sc.badgeOf(addrs[4], 5)), GL);
await A.distributor.connect(marketBuyer).claim(2, E(60_000), proofOf(scTree, addrs[4], E(60_000)), GL);
eq(await A.opus.balanceOf(addrs[4]), E(60_000), "A: klaim Soundcheck pembeli Magnum = 60.000 (cap)");
await expectRevert(
  A.distributor.connect(comp2).claim,
  [2, E(60_000), proofOf(scTree, addrs[11], E(60_000))],
  "invalid proof",
  "A: comp2 (Magnum terjual) tidak punya hak klaim Soundcheck"
);
await expectRevert(
  A.distributor.connect(comp1).claim,
  [2, E(60_000), proofOf(scTree, addrs[11], E(60_000))],
  "already claimed",
  "A: klaim Soundcheck dua kali revert"
);

// ---------- hari 88: akhir jendela 30 hari ----------
await advanceTo(88);
console.log("— Skenario A: Encore vesting & bonus —");
await expectRevert(A.sale.connect(regA(8)).claimEncore, [1], "Encore window closed", "A: Encore tidak bisa dipilih setelah jendela 30 hari");
eq(Number(await A.scherzoKey.keyOf(addrs[18])), 0, "A: tidak ada kunci dari Encore yang tertolak di luar jendela");
// Premiere tetap bisa setelah jendela (tanpa tenggat) — reg0 masih punya 9 Pass:
await A.sale.connect(regA(0)).claimPremiere(idsReg0[1], GL);
eq(Number(await A.scherzoKey.keyOf(addrs[10])), 0, "A: Premiere setelah jendela tutup tetap tidak menerbitkan kunci");
eq(await A.opus.balanceOf(addrs[10]), E(78_000) + E(14_960_000) + E(78_000), "A: Premiere tetap membayar penuh setelah jendela Encore tutup");
// Encore reg7: separuh vesting pada hari ke-30
const encBefore = await A.opus.balanceOf(addrs[17]);
await A.sale.connect(regA(7)).withdrawEncore(GL);
closeTo(await A.opus.balanceOf(addrs[17]), encBefore + E(19_500), E(200), "A: withdraw Encore hari ke-30 ≈ 19.500");
// Bonus Encore: vested 39.000 → bonus = 19.500 (tepat cap 50%)
const bonusBefore = await A.opus.balanceOf(addrs[17]);
await A.sale.connect(regA(7)).claimEncoreBonus(GL);
eq((await A.opus.balanceOf(addrs[17])) - bonusBefore, E(19_500), "A: bonus Encore reg7 membayar 19.500");
eq(await A.sale.encoreBonusOf(addrs[17]), E(19_500), "A: hak bonus Encore reg7 = 19.500 (cap 50% dari vesting)");
ok(await A.sale.encoreBonusClaimed(addrs[17]), "A: bonus Encore reg7 tertanda terklaim");
// Sisa pool Encore dibakar
const supplyBeforeBurn = await A.opus.totalSupply();
await A.sale.connect(anyone).burnEncoreRemainder(GL);
eq(supplyBeforeBurn - (await A.opus.totalSupply()), E("4941500"), "A: sisa pool Encore 4.941.500 dibakar (5 jt − total vesting 117.000/2; vesting kini termasuk 2 Encore reg6)");

// ---------- hari 89: jendela distributor tutup ----------
await advanceTo(89);
await expectRevert(
  A.distributor.connect(hub).claim,
  [1, E(5_000), proofOf(refTree, addrs[8], E(5_000))],
  "claim window closed",
  "A: klaim distributor setelah 30 hari revert"
);
const supplyB2 = await A.opus.totalSupply();
await A.distributor.connect(anyone).burnRemainder(1, GL);
eq(supplyB2 - (await A.opus.totalSupply()), E(5_000), "A: sisa pool referral (jatah hub tak terklaim) dibakar");
await A.distributor.connect(anyone).burnRemainder(2, GL);
await A.distributor.connect(anyone).burnRemainder(0, GL);
eq(await A.opus.balanceOf(await A.distributor.getAddress()), E(4_994_900), "A: sisa distributor = slack pool referral yang tak pernah jadi hak (terkunci permanen)");

// Encore reg7: sisa vesting lunas pada hari ke-60+
await advanceTo(120);
const encBefore2 = await A.opus.balanceOf(addrs[17]);
await A.sale.connect(regA(7)).withdrawEncore(GL);
closeTo((await A.opus.balanceOf(addrs[17])) - encBefore2, E(19_500), E(200), "A: withdraw Encore terakhir ≈ 19.500 (total vesting 39.000)");

// ---------- vesting tim ----------
console.log("— Skenario A: vesting tim —");
closeTo(await A.vesting.releasable(), E(19_400_000) * 32n / 365n, E(30_000), "A: releasable vesting hari ke-120 ≈ 19,4 jt × 32/365");
const beneBefore = await A.opus.balanceOf(addrs[1]);
await A.vesting.connect(anyone).release(GL);
ok((await A.opus.balanceOf(addrs[1])) > beneBefore, "A: release membayar ke wallet treasury");
await advanceTo(58 + 395);
await A.vesting.connect(anyone).release(GL);
eq(await A.opus.balanceOf(await A.vesting.getAddress()), 0n, "A: vesting kosong pada hari ke-395 pasca-lulus");
eq(await A.opus.balanceOf(addrs[1]), E(19_400_000), "A: total diterima treasury dari vesting = 19,4 jt OPUS");

// ======================================================================
// SKENARIO B — jalur GAGAL (totalSold < 5.000 di vonis)
// ======================================================================
console.log("— Skenario B: persiapan —");
newScenario();
const B = await deployStack({ regEnd: tsOf(40), saleStart: tsOf(40), verdict: tsOf(58) });
const regsB = signers.slice(600, 1100);
const presaleBuyerB = signers[1100];
await giveAgentIds([...addrs.slice(600, 1100), addrs[1100]]);
for (const s of regsB) await B.prelude.connect(s).register(GL);
eq(Number(await B.prelude.count()), 500, "B: 500 pendaftar");

const boughtB = new Set();
async function buyB(signer, count) {
  const addr = await signer.getAddress();
  if (!boughtB.has(addr)) {
    await fundUsdt(signer, E(100));
    await approveMax(signer, await B.sale.getAddress());
    boughtB.add(addr);
  }
  const receipt = await (await B.sale.connect(signer).buy(count, ZERO, GL_BIG)).wait();
  return mintedOf(receipt, B.pass);
}
await advanceTo(40);
await B.sc.connect(regsB[0]).checkIn(GL);
let idsB1;
for (let i = 0; i < 160; i++) {
  const ids = await buyB(regsB[i], 10);
  if (i === 1) idsB1 = ids;
}
eq(Number(await B.sale.totalSold()), 1600, "B: totalSold 1.600 (presale terbuka, jauh dari 5.000)");
await fundUsdt(presaleBuyerB, E(100));
await approveMax(presaleBuyerB, await B.presale.getAddress());
await B.presale.connect(presaleBuyerB).buy(E(20), GL);
eq(await B.presale.opusOwedOf(addrs[1100]), E(200_000), "B: presale buyerB berhak 200.000 OPUS");
await advanceTo(41);
await B.sc.connect(regsB[0]).checkIn(GL);
await advanceTo(43); // hari 42 bolong
await usdt.mint(addrs[600], E(1), GL);
await usdt.connect(regsB[0]).approve(await B.sc.getAddress(), E("0.1"), GL);
await B.sc.connect(regsB[0]).repairStreak(GL);
await B.sc.connect(regsB[0]).checkIn(GL);
await advanceTo(45);
const listTxB = await B.market.connect(regsB[1]).listPass(idsB1[0], E("0.8"), GL);
await listTxB.wait();

// ---------- vonis: GAGAL ----------
await advanceTo(58);
console.log("— Skenario B: vonis gagal & refund —");
await B.sale.connect(anyone).finalize(GL_BIG);
ok(await B.sale.failed(), "B: sale GAGAL di vonis");
eq(Number(await B.scherzoKey.totalKeys()), 0, "B: tidak ada kunci SCHERZO di jalur gagal");
await expectRevert(B.sale.connect(regsB[0]).claimEncore, [1], "not graduated", "B: Encore di jalur gagal revert — kunci tidak pernah terbit");
eq(Number(await B.sc.outcome()), 2, "B: Soundcheck tertanda Failed");
// Refund burn-to-settle
const usdtB2Before = await usdt.balanceOf(addrs[602]);
// regsB[2] tokenId: posisi 21–30 (pembeli ke-3 × 10). Verifikasi kepemilikan dulu:
eq(await B.pass.ownerOf(21), addrs[602], "B: Pass #21 milik regsB[2]");
await B.sale.connect(regsB[2]).refund(21, GL);
eq((await usdt.balanceOf(addrs[602])) - usdtB2Before, E(1), "B: refund membayar penuh 1 USDT (Tier 1)");
await expectRevert(B.pass.ownerOf, [21], "nonexistent token", "B: Pass refund ter-burn");
// Market beku: beli revert; penjual menarik kembali Pass-nya lalu refund
await expectRevert(B.market.connect(marketBuyer).buy, [1], "market closed", "B: market beku setelah vonis gagal");
await B.market.connect(regsB[1]).cancel(1, GL);
eq(await B.pass.ownerOf(idsB1[0]), addrs[601], "B: listing kembali ke penjual setelah gagal");
await B.sale.connect(regsB[1]).refund(idsB1[0], GL);
// Presale: refund penuh
const usdtPBBefore = await usdt.balanceOf(addrs[1100]);
await B.presale.connect(presaleBuyerB).claimRefund(GL);
eq((await usdt.balanceOf(addrs[1100])) - usdtPBBefore, E(20), "B: refund presale 100% (20 USDT)");
// OPUS presale tak terjual kembali ke vesting
await B.presale.connect(anyone).settleUnsold(GL);
eq(await B.opus.balanceOf(await B.vesting.getAddress()), E(19_800_000), "B: vesting = 15 jt + 4,8 jt presale tak terjual");
// Distributor: tidak ada klaim di jalur gagal
await expectRevert(B.distributor.connect(regsB[0]).claim, [2, E(1), []], "sale did not graduate", "B: klaim distributor di jalur gagal revert");
// Vesting tidak pernah mulai di jalur gagal
eq(await B.vesting.releasable(), 0n, "B: vesting terkunci selamanya bila sale gagal");
// Soundcheck: bagian pool repair diklaim kembali
const usdtR0Before = await usdt.balanceOf(addrs[600]);
await B.sc.connect(regsB[0]).claimPoolShareRefund(GL);
eq((await usdt.balanceOf(addrs[600])) - usdtR0Before, E("0.05"), "B: poolSharePaid 0,05 kembali ke pembayar repair");
// Jendela refund tutup di hari ke-72; dana distributor dibakar setelahnya
await advanceTo(73);
eq(await B.pass.ownerOf(31), addrs[603], "B: Pass #31 milik regsB[3]");
await expectRevert(B.sale.connect(regsB[3]).refund, [31], "refund window closed", "B: refund setelah 13 Jan revert (USDT terkunci)");
await B.distributor.connect(anyone).burnAllOnFailure(GL);
eq(await B.opus.balanceOf(await B.distributor.getAddress()), 0n, "B: seluruh 50 jt OPUS distributor dibakar di jalur gagal");

// ======================================================================
// SKENARIO C — gerbang 500: sale tertunda sampai ambang tercapai
// ======================================================================
console.log("— Skenario C: gerbang 500 pendaftar —");
newScenario();
const CS = await deployStack({ regEnd: tsOf(50), saleStart: tsOf(40), verdict: tsOf(58) });
for (let i = 0; i < 499; i++) await CS.prelude.connect(regA(i)).register(GL);
eq(Number(await CS.prelude.count()), 499, "C: 499 pendaftar (di bawah gerbang)");
await advanceTo(40);
await fundUsdt(regA(0), E(100));
await approveMax(regA(0), await CS.sale.getAddress());
await expectRevert(CS.sale.connect(regA(0)).buy, [1, ZERO], "Prelude gate not met", "C: buy tertahan selama pendaftar < 500");
eq(Number(await CS.sale.openedAt()), 0, "C: sale belum terbuka di hari H");
await advanceTo(41);
await CS.prelude.connect(regA(499)).register(GL);
eq(Number(await CS.prelude.count()), 500, "C: pendaftar ke-500 mendaftar di hari 41");
await CS.sale.connect(anyone).openSale(GL);
ok(Number(await CS.sale.openedAt()) >= tsOf(41), "C: openedAt terpatri di hari 41 (bukan 12 Des)");
await fundUsdt(nonReg, E(100));
await approveMax(nonReg, await CS.sale.getAddress());
await expectRevert(CS.sale.connect(nonReg).buy, [1, ZERO], "Prelude registrants only", "C: 48 jam pertama berjalan dari openedAt aktual");
await CS.sale.connect(regA(0)).buy(1, ZERO, GL);
eq(Number(await CS.sale.totalSold()), 1, "C: pendaftar bisa membeli segera setelah gerbang tercapai");
await advanceTo(44);
await CS.sale.connect(nonReg).buy(1, ZERO, GL);
eq(Number(await CS.sale.totalSold()), 2, "C: publik bisa membeli setelah 48 jam dari openedAt");
await advanceTo(58);
await CS.sale.connect(anyone).finalize(GL_BIG);
ok(await CS.sale.failed(), "C: vonis tetap 30 Des — sale yang tertunda tetap gagal bila tak mencapai 5.000");
eq(Number(await CS.scherzoKey.totalKeys()), 0, "C: tidak ada kunci SCHERZO (sale gagal)");

console.log(`\n=== HASIL FASE 2: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
