// Build SYMPHONY fase 1: kompilasi contracts/*.sol dengan solc (npm
// package), simpan ABI + bytecode ke artifacts/.
// Jalankan: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(root, "contracts");
const artifactsDir = join(root, "artifacts");
mkdirSync(artifactsDir, { recursive: true });

const FILES = [
  "PreludeRegistry.sol",
  "Soundcheck.sol",
  "TreasuryVault.sol",
  "OpusToken.sol",
  "SymphonyPass.sol",
  "SymphonySale.sol",
  "SymphonyMarket.sol",
  "TeamVesting.sol",
  "OpusDistributor.sol",
  "OpusPresale.sol",
  "ScherzoKey.sol",
];
const WANT = [
  "PreludeRegistry",
  "Soundcheck",
  "TreasuryVault",
  "OpusToken",
  "SymphonyPass",
  "SymphonySale",
  "SymphonyMarket",
  "TeamVesting",
  "OpusDistributor",
  "OpusPresale",
  "ScherzoKey",
];

const sources = {};
for (const f of FILES) {
  sources[f] = { content: readFileSync(join(contractsDir, f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    // Target paris: opcode terbaru yang aman di BSC (tanpa MCOPY/TSTORE Cancun).
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasError = false;
for (const msg of output.errors ?? []) {
  const line = `${msg.severity.toUpperCase()}: ${msg.formattedMessage.trim()}`;
  if (msg.severity === "error") {
    hasError = true;
    console.error(line);
  } else {
    console.warn(line);
  }
}
if (hasError) {
  console.error("KOMPILASI GAGAL");
  process.exit(1);
}

console.log(`solc ${solc.version()}`);
for (const name of WANT) {
  let found = null;
  for (const f of FILES) {
    const c = output.contracts?.[f]?.[name];
    if (c) found = c;
  }
  if (!found) {
    console.error(`Kontrak ${name} tidak ditemukan di hasil kompilasi`);
    process.exit(1);
  }
  const artifact = {
    contractName: name,
    compiler: solc.version(),
    abi: found.abi,
    bytecode: "0x" + found.evm.bytecode.object,
    deployedBytecode: "0x" + found.evm.deployedBytecode.object,
    bytecodeSizeBytes: found.evm.bytecode.object.length / 2,
    deployedSizeBytes: found.evm.deployedBytecode.object.length / 2,
  };
  writeFileSync(join(artifactsDir, `${name}.json`), JSON.stringify(artifact, null, 2));
  console.log(
    `${name}: creation ${artifact.bytecodeSizeBytes} B, runtime ${artifact.deployedSizeBytes} B (batas runtime EIP-170: 24576 B)`
  );
}
console.log("KOMPILASI BERSIH — artifacts tertulis di artifacts/");
