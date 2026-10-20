# GLASS — Privacy Policy

_Last updated: 2026-10-19_

GLASS is a browser extension that analyses public Solana blockchain data about the token page you are viewing. It is built so that **no personal data leaves your browser and no data about you is collected by anyone, including the GLASS developers.**

## What GLASS does with data

- **Reads the page URL** of supported trading terminals (pump.fun, Axiom, Photon, BullX, GMGN, DexScreener, Padre, Birdeye, Solscan) to find the token address being viewed. It does not read page content, forms, cookies, or storage of those sites.
- **Fetches public blockchain data** about that token (transactions, wallet balances, prices) from a Solana RPC endpoint and from public market-data APIs (DexScreener, GeckoTerminal, Jito bundle explorer, and pump.fun's public coin API for a creator wallet's launch history). These requests contain only token and wallet addresses that are already public on-chain. They contain nothing about you.
- **Stores locally, on your device only** (Chrome extension storage): your settings (RPC URL, toggles), a short-lived cache of scan results, panel position, and an index of wallets ↔ launches seen in earlier scans so repeat operators can be recognised. You can clear all of it from the popup at any time.

## What GLASS does not do

- No analytics, telemetry, crash reporting, or "phone home" of any kind.
- No accounts, no sign-in, no cookies.
- No access to your wallet, seed phrase, or private keys. GLASS never builds, signs, or sends a transaction and never asks you to connect a wallet.
- No access to your browsing history or to any site other than the supported terminals.
- Does not sell, share, or transmit any data to the developers or to third parties beyond the RPC and public API requests described above.

## Third-party services you connect to

When GLASS runs a scan, your browser makes requests to the Solana RPC endpoint configured in the popup (default: `solana-rpc.publicnode.com`, with `api.zan.top` as a history fallback) and to `api.dexscreener.com`, `api.geckoterminal.com`, `bundles.jito.wtf` and `frontend-api-v3.pump.fun` (read-only; the request carries only the creator wallet address). Those services see your IP address and the public addresses being looked up, as with any website request. If you enter a Helius (or other provider) API key, requests go to that provider under your own account and their privacy policy applies.

## Permissions

- `storage` — save settings and cache locally.
- Host permissions for the terminals (to show the panel) and for the RPC / public API hosts above (to fetch public chain data).
- Optional host permission — requested only if you type a custom RPC URL into the popup, so GLASS can reach that host.

## Contact

Questions or concerns: open an issue on the project repository.
