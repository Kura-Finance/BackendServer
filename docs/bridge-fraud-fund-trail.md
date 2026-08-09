# Bridge Fraud Fund Trail Report

On-chain investigation of ~992.5 USDC that entered a Kura SCA on Base and was drained within ~5 minutes into Relay protocol liquidity.

- **Source:** Base RPC + Basescan
- **Event date:** 2026-07-27 UTC
- **Report compiled:** 2026-08-06
- **Chain:** Base (8453)
- **Token:** USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

---

## Executive conclusion

Funds left the user SCA almost immediately via Li.Fi, hopped through a temporary address and a high-volume Nexus smart account, then entered Relay Depository liquidity. SCA residual ≈ $0.49. Fiat / on-chain return from the SCA is not possible. Personal trail ends at Relay (`0x7777…`); further destination requires Relay internal records.

| Metric | Value |
|--------|-------|
| USDC deposited to SCA | 992.5 |
| USDC principal routed out | 987.04 |
| Deposit → Relay pool | ~5 min |
| SCA USDC remaining | ≈0.49 |

---

## Key addresses

| Role | Address | Notes |
|------|---------|-------|
| User SCA (SafeProxy) | [`0xdb42798fA1e2f3863AE6010f2Ab2f49d8c2a12Fa`](https://basescan.org/address/0xdb42798fA1e2f3863AE6010f2Ab2f49d8c2a12Fa) | EntryPoint 0.7 / Pimlico; residual ≈0.489 USDC |
| Owner EOA | [`0x9819819556b93a00b3795ddbfcbd4f375ba1d799`](https://basescan.org/address/0x9819819556b93a00b3795ddbfcbd4f375ba1d799) | Controls the SCA |
| Deposit source | [`0x4c2c0F0bb2631b02ac9299c59690914Ee7A200B8`](https://basescan.org/address/0x4c2c0F0bb2631b02ac9299c59690914Ee7A200B8) | Likely Bridge / VA settlement related |
| Li.Fi Diamond | [`0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`](https://basescan.org/address/0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE) | Router that split / forwarded USDC |
| Hop (temp) | [`0x3F292b8eBC7Ace3A9A67549E497d30F15b7e3388`](https://basescan.org/address/0x3F292b8eBC7Ace3A9A67549E497d30F15b7e3388) | Held 987.04 for ~18s then Batch Withdraw |
| Nexus hub | [`0xd15E62E64c1265Dfb753eD6e7C76CB5FF8f276c7`](https://basescan.org/address/0xd15E62E64c1265Dfb753eD6e7C76CB5FF8f276c7) | ERC-7579 modular AA; >10k txs; mixer-style liquidity |
| Relay Depository | [`0x77777777dCc4d5A8B6E418Fd04D8997eF11000eE`](https://basescan.org/address/0x77777777dCc4d5A8B6E418Fd04D8997eF11000eE) | Cross-chain liquidity pool (~413k+ USDC at intake) |

---

## Fund flow timeline (UTC)

| Time (UTC) | Block | Amount | Step | Tx |
|------------|-------|--------|------|-----|
| 16:55:01 | 49190977 | 992.5 USDC | Deposit → SCA `0xdb42…12Fa` | [`0xc769…f0fe`](https://basescan.org/tx/0xc7693c08835fea3f456ce18b81582b8b891e185bcd90c6423db1da29a18ef0fe) |
| 16:59:43 | 49191118 | 992 USDC | SCA → Li.Fi; principal 987.04 → hop `0x3F29…3388` | [`0xc41c…a707`](https://basescan.org/tx/0xc41cf10a065dac4887160775159f04a2bfae6aab84ae67b94d100f7727cfa707) |
| 17:00:01 | 49191127 | 987.04 USDC | Hop Batch Withdraw → Nexus hub `0xd15E…76c7` | [`0x685f…1672`](https://basescan.org/tx/0x685f2be96bdab7eac74d0e9813f5e63cc89639f8796f15a2e51acd89b9111672) |
| 17:00:03 | 49191128 | 1934.193017 USDC | Hub sweep (incl. 987.04) → Relay `0x7777…00eE` | [`0x3739…833f`](https://basescan.org/tx/0x373944ffc9bf01d14c359ad1a0cd49337378db9638dd6ecce6a379a4c5bd833f) |

End-to-end: deposit at 16:55:01 → Relay pool at 17:00:03 (~5 minutes). Hop → hub → Relay completed in 2 seconds.

---

## Amount breakdown

### Li.Fi Handle Ops split

| Amount | Destination | Role |
|--------|-------------|------|
| 992.00 | `0x1231…4EaE` | SCA → Li.Fi Diamond |
| 987.04 | `0x3F29…3388` | Principal (main trail) |
| 2.48 | `0xC06e…264B` | Path / protocol fee |
| 2.48 | `0x0081…0295` | Integrator fee |
| 0.010626 | `0x4b74…d72A` | Relayer / ops dust |

### Nexus hub co-mingling proof

Exact 987.04 was never forwarded alone. Hub balance proves batching:

| Block | Hub USDC balance |
|-------|------------------|
| 49191126 (pre-IN) | 947.253017 |
| 49191127 (+987.04) | 1934.293017 |
| 49191128 (after OUT) | 0.100000 |

OUT 1934.193017 = prior balance + fraud principal − 0.1 dust, sent to Relay in one transfer.

---

## Path diagram

```text
Bridge/VA deposit source
  0x4c2c0F0b…ee7A200B8
        │  992.5 USDC   16:55:01 UTC
        ▼
User SCA (SafeProxy)
  0xdb42798f…d8c2a12Fa          residual ≈ 0.49 USDC
        │  992 USDC     16:59:43 UTC  (Li.Fi Handle Ops)
        ▼
Li.Fi Diamond
  0x1231DEB6…7486F4EaE
        │  987.04 USDC  (+ 2×2.48 fees)
        ▼
Temporary hop
  0x3F292b8e…15b7e3388
        │  987.04 USDC  17:00:01 UTC  (Batch Withdraw)
        ▼
Nexus / ERC-7579 hub  (high-volume AA)
  0xd15E62E6…FF8f276c7
        │  1934.19 USDC 17:00:03 UTC  (batched with ~947 already in hub)
        ▼
Relay Protocol Depository
  0x77777777…ef11000eE
        │
        ▼
Fungible protocol liquidity / CCTP burns
  — No matching 987.04 or 1934.19 single OUT
  — Personal on-chain trail ends here
```

---

## Entity analysis

### Hop — `0x3F29…3388`

Temporary staging address. Received 987.04 from Li.Fi and forwarded the exact amount ~18 seconds later via Batch Withdraw. Not an end beneficiary.

### Hub — `0xd15E…76c7`

ERC-7579 Nexus-style modular smart account (Minimal Proxy). Extremely high transfer volume. Aggregates many users’ USDC then routes to Relay / other liquidity paths. Not a personal wallet.

### End — `0x7777…00eE`

Relay Protocol Depository on Base. Intake joined a pool already holding ~413,822 USDC. Subsequent outs are mostly burns to `0x0` (cross-chain fills) in unrelated sizes — no recoverable single beneficiary on explorers.

---

## Return / remediation assessment

| Question | Answer |
|----------|--------|
| Can funds be returned from the SCA? | No — only ≈0.489 USDC remains |
| Can 987.04 be clawed from hop / hub? | No — both already emptied toward Relay |
| Can time+amount isolate funds inside Relay? | No — co-mingled; no matching OUT |
| Does this still count toward Bridge fraud rate? | Yes (policy: non-return does not remove attribution) |
| Further tracing option | Relay legal / partner request with tx `0x373944ff…` only |

---

## Recommended Kura actions

| # | Action | Status / note |
|---|--------|---------------|
| 1 | Pause Bridge customer + platform fraud suspend (login block) | Use admin fraud remediation APIs |
| 2 | Report trail to Bridge Slack with this report’s txs / amounts | Copy block below |
| 3 | Do not attempt on-chain return from SCA | Insufficient balance |
| 4 | Keep case in monthly fraud-rate numerator | US deposit-month attribution |

---

## Bridge Slack paste

```text
Fraud fund trail (Base USDC) — return not possible

User SCA: 0xdb42798fA1e2f3863AE6010f2Ab2f49d8c2a12Fa
Owner EOA: 0x9819819556b93a00b3795ddbfcbd4f375ba1d799
Deposit: 992.5 USDC at 2026-07-27 16:55:01 UTC
  from 0x4c2c0F0bb2631b02ac9299c59690914Ee7A200B8
  tx 0xc7693c08835fea3f456ce18b81582b8b891e185bcd90c6423db1da29a18ef0fe

Within ~5 minutes:
1) Li.Fi Handle Ops @ 16:59:43 UTC — 992 USDC out of SCA
   principal 987.04 → 0x3F292b8eBC7Ace3A9A67549E497d30F15b7e3388
   tx 0xc41cf10a065dac4887160775159f04a2bfae6aab84ae67b94d100f7727cfa707
2) Batch Withdraw @ 17:00:01 UTC — 987.04 → Nexus hub
   0xd15E62E64c1265Dfb753eD6e7C76CB5FF8f276c7
   tx 0x685f2be96bdab7eac74d0e9813f5e63cc89639f8796f15a2e51acd89b9111672
3) Hub sweep @ 17:00:03 UTC — 1934.193017 USDC (incl. 987.04)
   → Relay Depository 0x77777777dCc4d5A8B6E418Fd04D8997eF11000eE
   tx 0x373944ffc9bf01d14c359ad1a0cd49337378db9638dd6ecce6a379a4c5bd833f

SCA residual ≈ 0.49 USDC. Funds co-mingled in Relay liquidity;
no on-chain personal end beneficiary identifiable.
Cannot execute fiat/crypto return from user wallet.
```

---

## Appendix — full transaction hashes

| Step | Full hash |
|------|-----------|
| Deposit to SCA | `0xc7693c08835fea3f456ce18b81582b8b891e185bcd90c6423db1da29a18ef0fe` |
| Li.Fi Handle Ops | `0xc41cf10a065dac4887160775159f04a2bfae6aab84ae67b94d100f7727cfa707` |
| Hop → Hub Batch Withdraw | `0x685f2be96bdab7eac74d0e9813f5e63cc89639f8796f15a2e51acd89b9111672` |
| Hub → Relay | `0x373944ffc9bf01d14c359ad1a0cd49337378db9638dd6ecce6a379a4c5bd833f` |
