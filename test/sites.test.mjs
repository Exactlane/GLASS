import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/sites/urls.js';

const { detect } = globalThis.GlassSites;
const MINT = '5sYu1tykLMMmdeLPJ7qDUFDgMjV4psiFomsYpFdJpump';
const PAIR = 'C1iKUPuaiuYY3wsquuQC8xdv1GvSZPuPCNMmzvBvLM3F';

test('detects token pages on every supported terminal', () => {
  const cases = [
    [`https://pump.fun/coin/${MINT}`, 'pump.fun', MINT, true],
    [`https://pump.fun/${MINT}`, 'pump.fun', MINT, true],
    [`https://axiom.trade/meme/${PAIR}?chain=sol`, 'axiom', PAIR, false],
    [`https://photon-sol.tinyastro.io/en/lp/${PAIR}`, 'photon', PAIR, false],
    [`https://neo.bullx.io/terminal?chainId=1399811149&address=${MINT}`, 'bullx', MINT, true],
    [`https://gmgn.ai/sol/token/${MINT}`, 'gmgn', MINT, true],
    [`https://gmgn.ai/sol/token/abc_${MINT}`, 'gmgn', MINT, true],
    [`https://dexscreener.com/solana/${PAIR.toLowerCase()}`, 'dexscreener', null, undefined], // lowercased pair isn't valid base58 → fallback: none
    [`https://dexscreener.com/solana/${PAIR}`, 'dexscreener', PAIR, false],
    [`https://trade.padre.gg/trade/solana/${MINT}`, 'padre', MINT, true],
    [`https://birdeye.so/token/${MINT}?chain=solana`, 'birdeye', MINT, true],
    [`https://solscan.io/token/${MINT}`, 'solscan', MINT, true],
  ];
  for (const [href, site, id, hint] of cases) {
    const d = detect(href);
    assert.ok(d, href);
    assert.equal(d.site, site, href);
    assert.equal(d.identifier, id, href);
    if (id) assert.equal(d.hintIsMint, hint, href);
  }
});

test('non-token pages on supported sites yield no identifier; other sites yield null', () => {
  assert.equal(detect('https://pump.fun/board').identifier, null);
  assert.equal(detect('https://axiom.trade/pulse').identifier, null);
  assert.equal(detect('https://neo.bullx.io/terminal?chainId=1&address=0xabc').identifier, null);
  assert.equal(detect('https://example.com/coin/' + MINT), null);
});

test('pump-suffixed address anywhere in the URL is picked up as a fallback', () => {
  const d = detect(`https://axiom.trade/discover?token=${MINT}`);
  assert.equal(d.identifier, MINT);
  assert.equal(d.hintIsMint, true);
});
