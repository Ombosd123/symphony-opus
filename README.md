# SYMPHONY ($OPUS)

**Open Score — every note on-chain.**

SYMPHONY is a community fair-mint for Binance Agent ID holders on BNB Chain.
Every rule of the sale — prices, splits, deadlines, refunds — is enforced by
immutable, verified smart contracts. No hidden treasury cut, no manual
distribution, no promises: the score is open, and anyone can read it.

Edition 1 is **Rhapsody No. 1**.

## How it works — four stages

1. **Prelude** — Free registration for Agent ID holders (gas only). Each
   registrant receives a soulbound Prelude Pass. Registration closes when the
   sale opens, on 12 Dec 2026 at 12:00 UTC. **Hard gate: the sale opens only if
   at least 500 Prelude registrants have registered by that moment. Below 500,
   the sale does not open.**
2. **Soundcheck** — Free daily check-ins for all Agent ID holders. Streaks of
   1 / 3 / 7 / 14 days earn soulbound badges; completing the full set earns the
   OPUS MAGNUM. A broken streak can be repaired once for 0.1 USDT.
3. **The Sale — Rhapsody No. 1** — 12–30 Dec 2026. 5,000 Passes, sold in USDT,
   max 10 per wallet. The first 24 hours are reserved for Prelude registrants.
4. **Verdict & Claims** — A single verdict moment: **30 Dec 2026, 12:00 UTC.**
   If all 5,000 Passes sold, the liquidity pool opens and burn-to-claim begins.
   If not, every buyer is refunded **100%** (refund window 30 Dec 2026 –
   13 Jan 2027).

## Economics

| | |
|---|---|
| Passes | 5,000 (max 10 per wallet) |
| Tier 1 — Overture (Pass 1–1,500) | 1 USDT → 78,000 OPUS |
| Tier 2 — Crescendo (Pass 1,501–3,500) | 1.5 USDT → 65,000 OPUS |
| Tier 3 — Finale (Pass 3,501–5,000) | 2 USDT → 57,000 OPUS |
| Full raise | 7,500 USDT |
| Split | 90% liquidity pool / 10% treasury (TreasuryVault) |
| Token supply | 600,000,000 OPUS (plain ERC-20, no transfer tax) |
| Pool at graduation | 167,500,000 OPUS + 6,750 USDT on PancakeSwap V2, LP burned |

Claims are burn-to-claim, one NFT per transaction. Pass holders choose
**Premiere** (100% immediately) or **Encore** (50% immediately + 50% vested
over 60 days, plus a pro-rata bonus and a soulbound SCHERZO key — one per
wallet — recording a guaranteed Overture seat in Season 2, *Scherzo*, if it
opens).

Full design details are documented in the contract source code, which is the
authoritative specification.

## Partnerships

SYMPHONY is the first **Perk Partner of AgentQuest**: AgentQuest badge holders
who claim a Pass receive **+5,000 OPUS per Pass** (max 10 Passes per wallet),
paid in the same claim transaction. The perk is enforced by the sale contract
itself — the AgentQuest badge registry is bound once by the deployer — and is
funded by a fenced 10,000,000 OPUS pool inside the 25,000,000 OPUS referral
envelope (the sale referral itself is capped at 15,000,000 OPUS). The pool
divides into exactly 2,000 whole bonuses, is paid first-come at claim, and
only if the sale graduates.

## Contracts

All contracts are immutable (no owner withdrawal, no pause, no upgrade) and
compiled with solc 0.8.38, optimizer 200, EVM paris.

| Contract | Phase | Status |
|---|---|---|
| TreasuryVault | 1 | Deployed — 0x4d32E4a76C7389445F9CB76f7098E4D50E0503A7 (Sourcify exact match) |
| PreludeRegistry | 1 | Deployed — 0xeA2FC84d8B87cB8CbCd27bda65761625BB7dB678 (Sourcify exact match) |
| Soundcheck | 1 | Deployed — 0xf29BB5C9266e4bD829be23cC9878e241fb85DD71 (Sourcify exact match) |
| OpusToken | 2 | Built and tested — deployment early December 2026 |
| SymphonyPass | 2 | Built and tested — deployment early December 2026 |
| SymphonySale | 2 | Built and tested — deployment early December 2026 |
| SymphonyMarket | 2 | Built and tested — deployment early December 2026 |
| TeamVesting | 2 | Built and tested — deployment early December 2026 |
| OpusDistributor | 2 | Built and tested — deployment early December 2026 |
| OpusPresale | 2 | Built and tested — deployment early December 2026 |
| ScherzoKey | 2 | Built and tested — deployment early December 2026 |

## Repository layout

- `contracts/` — all Solidity sources (phase 1 + phase 2)
- `site/` — the static website (deployed to Cloudflare Pages)
- `build.mjs`, `test.mjs`, `test2.mjs`, `sound-test.mjs`, `intro-test.mjs` —
  local build and test harnesses (295 assertions across the full system)

## Links

- X: https://x.com/symphonyopus
- Website: https://symphony-opus.pages.dev
- Perk Partner: AgentQuest — https://zainumq.github.io/agentquest/
- Chain: BNB Chain (BSC, chainId 56)

## License

MIT — see `LICENSE`.
