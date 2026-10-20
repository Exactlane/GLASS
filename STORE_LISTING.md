# Chrome Web Store listing — copy/paste material

## Name (≤45 chars)
GLASS — Solana launch scanner

## Summary (≤132 chars)
Who really bought the launch, how the wallets link, and the dev's full track record — on every Solana token page.

## Category
Productivity → Developer Tools (or Workflow & Planning)

## Detailed description

GLASS adds a small panel to the token pages you already use — pump.fun, Axiom, Photon, BullX, GMGN, DexScreener, Padre, Birdeye, Solscan — and tells you who is behind a new Solana token before you buy.

What the panel shows

• One call, with confidence — Avoid / Caution / Neutral / Interesting, the reasons, and what GLASS doesn't know yet.
• Launch window — who bought in the block the token was created in, split into the operator's bundle wallets, sniper bots and organic buyers, plus the dev buy. One "bundled %" hides the difference; GLASS shows it.
• Coordination — identical transaction fingerprints, confirmed Jito bundles, a shared fee wallet, a shared fee-payer. Launch tools hide funding from transfer-graph tools; they can't hide identical execution.
• Launch wallets — age, pre-launch activity, how each wallet was funded (exchange, shared funder, WSOL-close trick), scripted warm-up detection.
• Insider flow — what the cluster still holds, when they first sold, coordinated exits, hand-offs to fresh wallets, selling in the last 10 minutes.
• Dev history — every token the creator wallet has ever launched (from pump.fun's public record), how far each ran, graduation rate, whether it is a token farm, when the cluster dumped, and a Bullish / Mixed / Bearish bundle rating, with the evidence for every link spelled out.
• What just happened — a live feed of the cluster's sells, buys and hand-offs that keeps refreshing while the page is open.
• Memory — sniper bots, fee wallets and funders seen on your earlier scans are flagged when they reappear.
• Where their launches usually top out — low / typical / high peak of prior launches and the level where they usually start selling, with a clear warning when the history is thin.

Everything runs in your browser against a public Solana RPC. No GLASS server, no account, no key required, no telemetry. The extension cannot touch your wallet: it never builds, signs or sends a transaction and has no wallet permissions. The code is open source and small enough to read.

Works best with a free Helius API key (settings → paste → Save): without one, the free public RPCs only keep the last ~14–18 hours of chain history.

GLASS recognises historical patterns. It is not financial advice.

## Permission justifications (for the "Privacy practices" tab)

- **storage** — stores the user's settings (RPC URL, toggles), a short-lived cache of scan results, panel position, and a local index of wallets seen in earlier scans. Nothing is synced to any server.
- **Host permission: terminal sites (pump.fun, axiom.trade, photon-sol.tinyastro.io, bullx.io, gmgn.ai, dexscreener.com, padre.gg, birdeye.so, solscan.io)** — needed to inject the analysis panel on token pages and read the page URL to find the token address. The extension does not read page content.
- **Host permission: Solana RPC providers (publicnode.com, api.zan.top, api.mainnet-beta.solana.com, helius-rpc.com, quiknode.pro, rpcpool.com, triton.one, alchemy.com, ankr.com, shyft.to, chainstack.com)** — JSON-RPC requests for public blockchain data (transactions, balances) about the token being viewed. The user picks which provider; the others are common choices the user may paste.
- **Host permission: api.dexscreener.com, api.geckoterminal.com, bundles.jito.wtf, frontend-api-v3.pump.fun** — public, keyless read APIs used for token metadata, price history, Jito bundle lookups and a creator wallet's pump.fun launch history. Requests carry only public token / wallet addresses.
- **Optional host permission (https://*/*)** — requested at runtime only when the user enters a custom RPC URL, so that provider can be reached. Never requested otherwise.
- **Remote code** — none. All code ships in the package; no eval, no external scripts.

## Single purpose statement
Analyse the launch of the Solana token on the current page (launch-block buyers, wallet links, insider activity, operator history) and display the result in an on-page panel.

## Data usage disclosures
- Does not collect or transmit personal data. Does not use data for purposes unrelated to the single purpose. Does not sell data.
- Privacy policy: PRIVACY.md (host it at a public URL and paste the link).

## Screenshots to take (1280×800)
1. Panel on Axiom with a bundled launch — verdict + launch bar visible.
2. Operator history open with the "linked because…" lines and the exit boxes.
3. Insider flow + Receipts open.
4. Popup settings.
