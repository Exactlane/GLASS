# GLASS

**See who is really behind a new Solana token — on the page you're already looking at.**

GLASS is a free, open-source Chrome extension. When you open a token on pump.fun, Axiom, Photon, BullX, GMGN, DexScreener, Padre, Birdeye or Solscan, a small panel appears and tells you:

- **Who bought in the launch block** — split into the operator's *bundle wallets*, *sniper bots*, and *organic* buyers, plus the dev buy. One "bundled %" number hides the difference; GLASS shows it.
- **How the launch wallets are connected** — identical transaction fingerprints, confirmed Jito bundles, a shared fee wallet, a shared fee-payer, same-hour funding, and the WSOL-account-close trick that hides funding from Bubblemaps.
- **What the insiders are doing now** — what the cluster still holds, when they first sold, coordinated exits, token hand-offs to fresh wallets, and whether they're selling in the last 10 minutes.
- **One-word call with confidence** — **Avoid / Caution / Neutral / Interesting**, with the reasons and with what GLASS *doesn't* know yet, so a two-second glance is enough.
- **The dev's full track record** — every token the creator wallet has ever launched (from pump.fun's own record, not a sample), how far each one ran, when the cluster dumped, whether it's a **token farm** that mints dozens a day, and a **Bullish / Mixed / Bearish bundle** rating.
- **A historical exit zone** — where this dev's launches usually top out (low / typical / high) and the level where they usually start selling.
- **What just happened** — a live feed of the cluster's sells, buys and hand-offs that keeps refreshing while the page is open.
- **Memory** — sniper bots, fee wallets and funders you've seen on earlier scans are flagged when they show up again.

### Why

Every terminal shows "bundled 23%". None of them tell you *whether that bundle is good or bad for you*. A bundle run by an operator who takes coins to $500k is a different trade from one run by someone who sells at $4k every time. Launch tools (Proxima, Sumo, …) now fund wallets through exchanges and WSOL tricks so the transfer-graph tools show nothing — but they can't hide identical execution, shared payers, or the operator's history. GLASS reads that history and shows you the receipts, not just a verdict.

Everything runs **in your browser against a public Solana RPC**. There is no GLASS server, no account, no key, no telemetry.

> GLASS recognises historical patterns. It is not financial advice and it will be wrong sometimes — operators change behaviour.

---

## Install

1. Download the latest `glass-extension-x.y.z.zip` and unzip it.
2. Chrome → `chrome://extensions` → turn on **Developer mode** (top right) → **Load unpacked** → select the unzipped folder (the one containing `manifest.json`).
3. Open any token page on a supported terminal. The panel appears bottom-right and fills in stage by stage (10–20 s for a fresh launch). Drag it anywhere; the **—** button collapses it to a pill.

**Recommended: add a free [Helius](https://dashboard.helius.dev) API key** (click the GLASS icon → paste → **Use** → **Save**). Without a key GLASS uses free public endpoints that only keep the last ~14–18 hours of chain history, so tokens older than that can't be scanned and wallets older than that show "age unknown". With a Helius key everything works for any token age, with higher rate limits. (Solana's own `api.mainnet-beta.solana.com` rejects browser extensions; if you set it, GLASS falls back automatically.)

Updating: unzip over the old folder → `chrome://extensions` → press ↻ on the GLASS card → reload the terminal tab.

---

## Verify it isn't a drainer

You should not trust an extension that sits on your trading terminal because a README says so. Here is how to check for yourself in a few minutes.

**1. It cannot touch your wallet.** Open `manifest.json`:
- `permissions` is only `storage` (its own settings and cache). No `tabs`, `cookies`, `webRequest`, `scripting`, `alarms`, `clipboardRead`, `downloads`, `nativeMessaging`.
- Content scripts run only on the listed terminal domains. They **never** run on wallet extensions, exchange sites, or any page you type a seed phrase into.
- `host_permissions` lists only RPC providers and the public data APIs it reads (DexScreener, GeckoTerminal, Jito's bundle explorer). `optional_host_permissions` is requested only if *you* type a custom RPC URL into the popup.

**2. It never asks you to sign anything.** Search the whole source for the words `signTransaction`, `signMessage`, `solana.connect`, `window.solana`, `phantom`, `privateKey`, `secretKey`, `mnemonic`, `seed`:

```bash
grep -rniE "signTransaction|signMessage|window\.solana|phantom|privateKey|secretKey|mnemonic|seed phrase" src/
```

Zero matches. GLASS only *reads* public chain data; it has no code path that builds, signs or sends a transaction.

**3. It sends nothing anywhere it shouldn't.** Every network call is a `fetch(...)` in `src/lib/`:

```bash
grep -rn "fetch(" src/
```

They all go to: the RPC URL you chose (or the built-in fallbacks `solana-rpc.publicnode.com` / `api.zan.top`), `api.dexscreener.com`, `api.geckoterminal.com`, `bundles.jito.wtf`. Nothing is posted anywhere except JSON-RPC bodies to the RPC. You can also watch the service worker's **Network** tab in `chrome://extensions` → GLASS → *service worker* → Network.

**4. The page can't inject into it, and it can't read your page.** The panel lives in a closed-off Shadow DOM, and the content script reads only `location.href` (to find the token address). It does not read the DOM, forms, or storage of the terminal.

**5. No build step, no dependencies.** What you see in `src/` is byte-for-byte what Chrome runs — no bundler, no minified blob, zero npm packages at runtime (`package.json` has no `dependencies`). Base58, PDA derivation and the ed25519 curve check are implemented in plain JS you can read (`src/lib/base58.js`, `src/lib/pda.js`).

**6. Verify the zip you got matches the repo.** `sha256sum glass-extension-x.y.z.zip` and compare with the hash on the release.

If you find anything that contradicts the above, that is the highest-priority bounty in this repo — open an issue.

---

## Bounties

GLASS is funded by the fee share of the GLASS token: a fixed percentage of creator fees goes into a multisig that pays out bounties on merged PRs. Every heuristic is a small pure function with a test next to it (`npm test` runs 26 of them in a few seconds against real mainnet fixtures), so the loop is: open an issue describing the detection gap → add a failing test → make it pass → PR.

Open bounties (see the issue tracker for amounts):

| Area | What's needed | File |
|---|---|---|
| **Launcher labels** | Confirmed fee / tip wallets of Proxima, Sumo, Fortune, Rapid Launch, etc., with on-chain evidence, so the panel can say "launched with X" instead of "shared fee wallet" | `src/data/known.js → launchers` |
| **Exchange hot wallets** | More labelled CEX deposit/withdrawal wallets (with a source) — improves "funded from N exchanges" | `src/data/known.js → exchanges` |
| **Router / bot programs** | Program IDs of Axiom, BullX, GMGN, Trojan, Maestro, Bloom, … routers for the route fingerprint | `src/data/known.js → programs` |
| **New evasion patterns** | Any funding or execution trick that beats the current signals (e.g. funding via Jupiter swaps, multi-hop WSOL, delayed warm-ups). Ship the detector + fixture | `src/lib/scan/wallets.js`, `fingerprint.js` |
| **Similar launches** | Index past launches by *fingerprint* (funding style, sniper mix, launch-slot shape) rather than exact wallet match, so a rotated-wallet operator still matches "17 launches like this in 30 days: median peak 3.8×, 71% dumped within 90 min". Needs a shared index — see the pre-scan worker below | `src/lib/scan/fingerprint.js`, new `worker/` |
| **Trajectory matching** | Compare the first 5–15 minutes of price/volume/unique-buyer curve against a library of past launches ("82% similar to tokens that graduated") | new `src/lib/scan/trajectory.js` |
| **Non-pump launchpads** | Creator history for Bonk / Raydium LaunchLab / Meteora launches (pump.fun's record only covers pump.fun) | `src/lib/scan/devprofile.js` |
| **Pre-scan worker** | A community worker that scans every new pump.fun mint as it lands (via the mint-authority signature feed) and publishes results to a shared index, so the panel is instant | new `worker/` |
| **Graduated-token early window** | Better early-window coverage for huge tokens where bonding-curve signature paging is capped | `src/lib/scan/launch.js` |
| **USDC-quoted pairs** | Correct USD math for pump.fun USDC pairs (quote amounts are parsed, USD math assumes SOL) | `src/lib/scan/*` |
| **Firefox build** | MV3 service-worker differences | `manifest.json`, `src/background.js` |
| **Security review** | Anything that contradicts the "Verify it isn't a drainer" section above | everywhere |

### Developing

```bash
npm test                                    # 26 tests, real mainnet fixtures, no network needed
node cli/scan.mjs <mint-or-pair> [--json out.json] [--rpc URL] [--origin chrome-extension://x]   # same engine, in the terminal
node cli/pack.mjs                           # builds dist/glass-extension-<version>.zip
```

Layout: `src/background.js` (worker that runs scans), `src/content.js` (the panel), `src/sites/urls.js` (which URL means which token), `src/lib/scan/*` (the detection stages: launch → fingerprint → wallets → live → operator → score), `src/data/known.js` (community labels).

MIT licensed.
