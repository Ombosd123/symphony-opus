#!/usr/bin/env python3
"""leaderboard-gen.py — builds site/leaderboard-data.json from on-chain reads.

Method (all values are exact contract views, never event arithmetic):
  1. PreludeRegistry.count() + ownerOf(1..count)  -> every registrant.
  2. PreludeRegistry.referralCount(owner)         -> referral board.
  3. Candidate checkers = all registrants UNION the forward monitor
     ledger (~/workspace/symphony/agents-forward.json, checkin_count>0).
     Soundcheck is open to Agent ID holders who never registered for
     Prelude, so the ledger union matters; a launch-day-only checker
     (total 1, streak 0) can never reach the top 10, so the ledger's
     22 Nov 23:58 WIB start does not distort the boards.
  4. Soundcheck.streakOf + totalCheckInsOf per candidate -> check-in
     board (streak desc, then total desc).
Output: site/leaderboard-data.json. Safe to re-run any time.
"""
import json
import os
import sys
import time

import requests
from web3 import Web3

RPC = "https://bsc-dataseed.binance.org"
PRELUDE = "0xeA2FC84d8B87cB8CbCd27bda65761625BB7dB678"
SOUNDCHECK = "0xf29BB5C9266e4bD829be23cC9878e241fb85DD71"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "site", "leaderboard-data.json")
LEDGER = os.path.join(HERE, "..", "agents-forward.json")

SEL = {
    "count": Web3.keccak(text="count()")[:4].hex(),
    "ownerOf": Web3.keccak(text="ownerOf(uint256)")[:4].hex(),
    "referralCount": Web3.keccak(text="referralCount(address)")[:4].hex(),
    "streakOf": Web3.keccak(text="streakOf(address)")[:4].hex(),
    "totalCheckInsOf": Web3.keccak(text="totalCheckInsOf(address)")[:4].hex(),
}


def enc_addr(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def enc_uint(n):
    return format(n, "064x")


def single_call(to, data):
    r = requests.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                                  "params": [{"to": to, "data": "0x" + data}, "latest"]},
                      timeout=30)
    r.raise_for_status()
    return r.json().get("result")


def batch_call(calls):
    """calls: list of (to, data_hex). Returns list of raw result hex strings.
    dataseed silently drops items from large batches, so chunks stay at
    10 and any missing result is retried as a single call."""
    results = [None] * len(calls)
    B = 10
    for i in range(0, len(calls), B):
        chunk = calls[i:i + B]
        payload = [
            {"jsonrpc": "2.0", "id": j, "method": "eth_call",
             "params": [{"to": to, "data": "0x" + data}, "latest"]}
            for j, (to, data) in enumerate(chunk)
        ]
        try:
            r = requests.post(RPC, json=payload, timeout=60)
            r.raise_for_status()
            by_id = {it["id"]: it.get("result") for it in r.json() if it.get("id") is not None}
            for j in range(len(chunk)):
                results[i + j] = by_id.get(j)
        except Exception:
            pass
        for j, (to, data) in enumerate(chunk):
            if results[i + j] is None:
                try:
                    results[i + j] = single_call(to, data)
                except Exception:
                    results[i + j] = None
                time.sleep(0.05)
        time.sleep(0.1)
    return results


def to_int(h):
    return int(h, 16) if h and h != "0x" else 0


def to_addr(h):
    return "0x" + h[-40:].lower() if h else None


def main():
    count = to_int(batch_call([(PRELUDE, SEL["count"])])[0])
    print(f"registrants (count): {count}")
    owners_raw = batch_call([(PRELUDE, SEL["ownerOf"] + enc_uint(i)) for i in range(1, count + 1)])
    owners = []  # (tokenId, address)
    for i, h in enumerate(owners_raw, start=1):
        a = to_addr(h)
        if a:
            owners.append((i, a))
    uniq_owners = list({a for _, a in owners})

    refs_raw = batch_call([(PRELUDE, SEL["referralCount"] + enc_addr(a)) for a in uniq_owners])
    refs = {a: to_int(h) for a, h in zip(uniq_owners, refs_raw)}
    first_pass = {}
    for tid, a in owners:
        first_pass.setdefault(a, tid)
    referral = sorted(
        ({"addr": a, "refs": n} for a, n in refs.items() if n > 0),
        key=lambda r: (-r["refs"], first_pass.get(r["addr"], 1 << 30)),
    )[:10]

    candidates = set(uniq_owners)
    if os.path.exists(LEDGER):
        ledger = json.load(open(LEDGER))
        for a, rec in ledger.get("agents", {}).items():
            if rec.get("checkin_count", 0) > 0:
                candidates.add(a.lower())
    candidates = sorted(candidates)
    print(f"checker candidates: {len(candidates)}")
    streak_raw = batch_call([(SOUNDCHECK, SEL["streakOf"] + enc_addr(a)) for a in candidates])
    total_raw = batch_call([(SOUNDCHECK, SEL["totalCheckInsOf"] + enc_addr(a)) for a in candidates])
    rows = []
    for a, s, t in zip(candidates, streak_raw, total_raw):
        total = to_int(t)
        if total > 0:
            rows.append({"addr": a, "streak": to_int(s), "total": total})
    checkin = sorted(rows, key=lambda r: (-r["streak"], -r["total"], r["addr"]))[:10]

    data = {
        "updated": int(time.time()),
        "registrants": count,
        "checkers": len(rows),
        "checkin": checkin,
        "referral": referral,
    }
    with open(OUT, "w") as f:
        json.dump(data, f, indent=1)
    print(f"wrote {OUT}: checkers={len(rows)} checkin_top={len(checkin)} referral_top={len(referral)}")
    print("checkin #1:", checkin[0] if checkin else None)
    print("referral #1:", referral[0] if referral else None)


if __name__ == "__main__":
    sys.exit(main())
