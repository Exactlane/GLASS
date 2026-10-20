// Site adapters: turn a terminal URL into { site, identifier, hintIsMint }.
// Plain script (no imports) so it can be loaded as a content script alongside content.js, and
// imported for its side effect (globalThis.GlassSites) in tests.
(() => {
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const isAddr = (s) => typeof s === 'string' && B58.test(s);

  const SITES = [
    {
      name: 'pump.fun',
      host: /(^|\.)pump\.fun$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        // Only token pages: /coin/<mint>. Profiles (/profile/<wallet>), boards, livestreams carry
        // wallet addresses that are not tokens.
        const i = parts.indexOf('coin');
        if (i < 0) return null;
        const id = parts[i + 1];
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
    {
      name: 'axiom',
      host: /(^|\.)axiom\.trade$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('meme');
        const id = i >= 0 ? parts[i + 1] : null;
        return isAddr(id) ? { identifier: id, hintIsMint: false } : null;
      },
    },
    {
      name: 'photon',
      host: /(^|\.)photon-sol\.tinyastro\.io$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('lp');
        const id = i >= 0 ? parts[i + 1] : null;
        return isAddr(id) ? { identifier: id, hintIsMint: false } : null;
      },
    },
    {
      name: 'bullx',
      host: /(^|\.)bullx\.io$/,
      parse(u) {
        const id = u.searchParams.get('address');
        const chain = u.searchParams.get('chainId');
        if (chain && chain !== '1399811149') return null; // Solana only
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
    {
      name: 'gmgn',
      host: /(^|\.)gmgn\.ai$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'sol') return null;
        const i = parts.indexOf('token');
        let id = i >= 0 ? parts[i + 1] : null;
        if (id && id.includes('_')) id = id.split('_').pop();
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
    {
      name: 'dexscreener',
      host: /(^|\.)dexscreener\.com$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'solana') return null;
        const id = parts[1];
        return isAddr(id) ? { identifier: id, hintIsMint: false } : null;
      },
    },
    {
      name: 'padre',
      host: /(^|\.)padre\.gg$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('solana');
        const id = i >= 0 ? parts[i + 1] : null;
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
    {
      name: 'birdeye',
      host: /(^|\.)birdeye\.so$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('token');
        const id = i >= 0 ? parts[i + 1] : null;
        const chain = u.searchParams.get('chain');
        if (chain && chain !== 'solana') return null;
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
    {
      name: 'solscan',
      host: /(^|\.)solscan\.io$/,
      parse(u) {
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('token');
        const id = i >= 0 ? parts[i + 1] : null;
        return isAddr(id) ? { identifier: id, hintIsMint: true } : null;
      },
    },
  ];

  function detect(href) {
    let u;
    try {
      u = new URL(href);
    } catch {
      return null;
    }
    for (const s of SITES) {
      if (!s.host.test(u.hostname)) continue;
      const r = s.parse(u);
      if (r) return { site: s.name, ...r };
      // Fallback for supported sites: any pump-suffixed address anywhere in the URL (never on
      // wallet/profile pages, where it would be someone's holdings, not the page's token)
      const m = /\/(profile|wallet|user|account|address)\//.test(u.pathname) ? null : (u.pathname + u.search).match(/[1-9A-HJ-NP-Za-km-z]{28,40}pump\b/);
      if (m) return { site: s.name, identifier: m[0], hintIsMint: true };
      return { site: s.name, identifier: null };
    }
    return null;
  }

  globalThis.GlassSites = { detect, isAddr, SITES: SITES.map((s) => s.name) };
})();
