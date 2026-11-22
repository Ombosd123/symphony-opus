// config.js — SYMPHONY site configuration.
//
// ============================================================
//  PHASE 1 — NOT DEPLOYED YET.
//  Fill the three contract addresses below AFTER the Remix
//  deployment (see ../REMIX-DEPLOY-KIT.md), then redeploy the
//  site. Until then the site runs in info-only mode: counters
//  show "—" and wallet actions stay disabled.
// ============================================================
window.SYMPHONY_CONFIG = {
  // --- Contract addresses (BNB Chain mainnet) — TO FILL AFTER DEPLOY ---
  PRELUDE_ADDRESS: "0xeA2FC84d8B87cB8CbCd27bda65761625BB7dB678", // PreludeRegistry
  SOUNDCHECK_ADDRESS: "0xf29BB5C9266e4bD829be23cC9878e241fb85DD71", // Soundcheck
  VAULT_ADDRESS: "0x4d32E4a76C7389445F9CB76f7098E4D50E0503A7", // TreasuryVault

  // --- Fixed network / ecosystem values ---
  AGENT_ID_REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  USDT_ADDRESS: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT (18 decimals)
  TREASURY_WALLET: "0x06509A5D9496A3Bfc996495c53AAA57515ca569e",
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
  READ_RPC: "https://bsc-dataseed.binance.org",

  // --- Fixed schedule (UTC) ---
  SALE_OPEN_TS: 1797076800, // Sat 12 Dec 2026, 12:00 UTC
  SALE_END_TS: 1798632000, // Wed 30 Dec 2026, 12:00 UTC — the verdict: minting closes, outcome is decided
  PRELUDE_GATE: 500,

  // --- Contact form (Web3Forms) ---
  // Create a free Web3Forms access key for the project inbox and paste
  // it here before publishing. The destination inbox is configured
  // inside Web3Forms — it is never written on this page.
  WEB3FORMS_ACCESS_KEY: "REPLACE_WITH_WEB3FORMS_ACCESS_KEY",
  // Cloudflare Turnstile site key for the contact form (spam protection).
  TURNSTILE_SITE_KEY: "REPLACE_WITH_TURNSTILE_SITE_KEY",
};
