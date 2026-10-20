import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseLaunch, inferBundles, fingerprintOf, applyWalletKinds, enrichWithJito } from '../src/lib/scan/fingerprint.js';
import { classifyKind } from '../src/lib/scan/wallets.js';
import { rateOperator } from '../src/lib/scan/operator.js';
import { computeScore } from '../src/lib/scan/score.js';
import { trackCluster } from '../src/lib/scan/live.js';
import { MemoryStore, OperatorMemory, TtlCache } from '../src/lib/cache.js';
import { PROGRAMS } from '../src/lib/constants.js';

const SUPPLY = 1_000_000_000;
const W = (i) => `W${String(i).padStart(43, 'x')}`;

function ev(over) {
  return {
    sig: over.sig || `S${Math.random()}`,
    slot: 100 + (over.slotOffset || 0),
    slotOffset: over.slotOffset || 0,
    secOffset: over.secOffset ?? (over.slotOffset || 0) * 0.4,
    order: (100 + (over.slotOffset || 0)) * 1_000_000 + (over.index || 0),
    wallet: over.wallet,
    payer: over.wallet,
    side: over.side || 'buy',
    tokens: over.tokens || 10_000_000,
    sol: over.sol ?? 0.5,
    isCreator: !!over.isCreator,
    inCreateTx: !!over.inCreateTx,
    cuLimit: over.cuLimit ?? 70000,
    cuPrice: over.cuPrice ?? 100000,
    jitoTip: over.jitoTip ?? 0,
    tipAccount: over.tipAccount ?? null,
    route: over.route ?? PROGRAMS.PUMP,
    ixCount: over.ixCount ?? 4,
    slippageLimitSol: over.slippageLimitSol ?? null,
    externalFeeRecipients: over.externalFeeRecipients || [],
  };
}

test('analyseLaunch: uniform slot-0 buys with shared tip + fee wallet → launch-tool pattern', () => {
  const events = [ev({ wallet: 'DEV', isCreator: true, inCreateTx: true, tokens: 50_000_000, sol: 1.5, slotOffset: 0, index: 0 })];
  for (let i = 0; i < 12; i++) events.push(ev({ wallet: W(i), slotOffset: 0, index: i + 1, tokens: 15_000_000, sol: 0.5, jitoTip: 1_000_000, tipAccount: '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', externalFeeRecipients: ['FEEWALLET'] }));
  events.push(ev({ wallet: W(99), slotOffset: 7, index: 3, tokens: 2_000_000, cuLimit: 200000 }));
  const a = analyseLaunch(events, { supply: SUPPLY, slotWindow: 3, earlyWindowSec: 60 });
  assert.equal(a.creatorDevBuy.pct, 5);
  assert.equal(a.slot0.count, 12);
  assert.equal(Math.round(a.slot0.pct), 18);
  assert.equal(a.window.count, 12);
  assert.equal(a.early.count, 13);
  assert.equal(a.fingerprints.uniformity, 1);
  assert.equal(a.jito.tippedCount, 12);
  assert.equal(a.jito.identicalTipShare, 1);
  assert.equal(a.sharedFeeRecipients[0].address, 'FEEWALLET');
  assert.equal(a.sharedFeeRecipients[0].wallets.length, 12);
  assert.ok(a.launchToolPattern.detected);
  assert.ok(a.launchToolPattern.reasons.length >= 3);
  assert.ok(a.jito.inferredBundles.length >= 1, 'adjacent tipped txs inferred as bundles');
});

test('analyseLaunch: scattered organic buys → no pattern', () => {
  const events = [ev({ wallet: 'DEV', isCreator: true, tokens: 20_000_000, sol: 0.6 })];
  for (let i = 0; i < 6; i++) events.push(ev({ wallet: W(i), slotOffset: i, index: i, tokens: 1_000_000 * (i + 1), cuLimit: 60000 + i * 1000, cuPrice: 50000 * (i + 1), jitoTip: i % 2 ? 50_000 * i : 0, tipAccount: i % 2 ? 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe' : null }));
  const a = analyseLaunch(events, { supply: SUPPLY, slotWindow: 3 });
  assert.equal(a.slot0.count, 1);
  assert.ok(a.fingerprints.uniformity <= 0.34);
  assert.ok(!a.launchToolPattern.detected);
});

test('inferBundles groups adjacent tipped txs in the same slot (max 5)', () => {
  const evs = [];
  for (let i = 0; i < 7; i++) evs.push(ev({ wallet: W(i), slotOffset: 0, index: i, jitoTip: 1000, tipAccount: 'x' }));
  evs.push(ev({ wallet: W(20), slotOffset: 1, index: 0, jitoTip: 1000, tipAccount: 'x' })); // alone
  const b = inferBundles(evs);
  assert.deepEqual(b.map((x) => x.length), [5, 2]);
});

test('fingerprintOf buckets priority fee and slippage', () => {
  const a = fingerprintOf(ev({ wallet: 'a', cuPrice: 123456, sol: 1, slippageLimitSol: 1.2 }));
  const b = fingerprintOf(ev({ wallet: 'b', cuPrice: 124000, sol: 2, slippageLimitSol: 2.4 }));
  assert.equal(a, b, 'same 2-sig-fig price, same 20% slippage → same fingerprint');
  const c = fingerprintOf(ev({ wallet: 'c', cuPrice: 200000 }));
  assert.notEqual(a, c);
});

test('enrichWithJito groups by bundle id and bumps the pattern', async () => {
  const events = [];
  for (let i = 0; i < 4; i++) events.push(ev({ sig: `sig${i}`, wallet: W(i), slotOffset: 0, index: i, jitoTip: 1000, tipAccount: 'x' }));
  const a = analyseLaunch(events, { supply: SUPPLY });
  const lookup = async (sig) => (sig === 'sig3' ? 'B2' : 'B1');
  await enrichWithJito(a, events, lookup);
  assert.equal(a.jito.bundleIds.length, 2);
  assert.equal(a.jito.confirmedMultiTxBundles, 1);
  assert.deepEqual(a.jito.bundleIds.find((b) => b.id === 'B1').wallets.length, 3);
});

test('classifyKind separates snipers, bundle wallets and organic holders', () => {
  assert.equal(classifyKind({ txCountCapped: true, preLaunchTxs: 999, fundingKind: 'unknown' }), 'sniper');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 180, fundingKind: 'wallet', ageHoursAtLaunch: 2000 }), 'sniper');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 0, fundingKind: 'exchange', ageHoursAtLaunch: 0.2 }), 'bundle');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 8, fundingKind: 'exchange', ageHoursAtLaunch: 30, activityScore: 0.7 }), 'bundle');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 70, fundingKind: 'linked', ageHoursAtLaunch: 500 }), 'bundle');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 90, fundingKind: 'wallet', ageHoursAtLaunch: 2000, activityScore: 0.2 }), 'organic');
  assert.equal(classifyKind({ txCountCapped: false, preLaunchTxs: 90, fundingKind: 'wallet', ageHoursAtLaunch: 2000, activityScore: 0.2 }, { firstSlotOffset: 0, tip: 5000 }), 'sniper');
});

test('applyWalletKinds splits the window into bundle / sniper / organic supply', () => {
  const events = [];
  for (let i = 0; i < 6; i++) events.push(ev({ wallet: W(i), slotOffset: 0, index: i, tokens: 10_000_000 }));
  const a = analyseLaunch(events, { supply: SUPPLY });
  const profiles = [
    { wallet: W(0), kind: 'sniper' },
    { wallet: W(1), kind: 'sniper' },
    { wallet: W(2), kind: 'bundle' },
    { wallet: W(3), kind: 'bundle' },
    { wallet: W(4), kind: 'organic' },
  ];
  applyWalletKinds(a, profiles);
  assert.equal(a.snipers.count, 2);
  // W(4) was profiled "organic" but bought in the creation block with the same fingerprint as the
  // bundle wallets → execution evidence wins: bundle. Unclassified W(5) also counts toward bundle.
  assert.equal(a.bundle.count, 4);
  assert.equal(a.organic.count, 0);
  assert.equal(a.bundle.pct, 4);
  assert.match(a.buyers.find((b) => b.wallet === W(4)).kindReason, /creation block/);
  // An organic wallet that bought a few slots later keeps its label
  const events2 = [ev({ wallet: W(0), slotOffset: 0, index: 0, tokens: 10_000_000 }), ev({ wallet: W(1), slotOffset: 2, index: 1, tokens: 10_000_000 })];
  const a2 = analyseLaunch(events2, { supply: SUPPLY });
  applyWalletKinds(a2, [{ wallet: W(0), kind: 'bundle' }, { wallet: W(1), kind: 'organic', ageHoursAtLaunch: 500, preLaunchTxs: 80 }]);
  assert.equal(a2.organic.count, 1);
});

const launch = (peak, { now = peak * 0.5, ttp = 20, graduated = peak >= 69000, exit = null } = {}) => ({
  mint: `M${peak}`, peakMcapUsd: peak, nowMcapUsd: now, minutesToPeak: ttp, graduated, clusterExit: exit, relation: 'created',
});

test('rateOperator: serial rugger → bearish, exit zone collapses to the dump level', () => {
  const launches = [
    launch(4800, { now: 2900, ttp: 2, exit: { sells: 3, firstSellMin: 2, peakShareAtFirstSell: 0.8, mcapAtFirstSellUsd: 3700 } }),
    launch(4900, { now: 2900, ttp: 1, exit: { sells: 2, firstSellMin: 2, peakShareAtFirstSell: 0.7, mcapAtFirstSellUsd: 3600 } }),
    launch(4800, { now: 2900, ttp: 0, exit: { sells: 2, firstSellMin: 3, peakShareAtFirstSell: 0.75, mcapAtFirstSellUsd: 3700 } }),
  ];
  const r = rateOperator(launches, { marketCapUsd: 4000 });
  assert.ok(r.score < 40, `score ${r.score}`);
  assert.equal(r.label, 'Bearish bundle');
  assert.equal(r.exit.operatorDump.minutes, 2);
  assert.ok(Math.abs(r.exit.operatorDump.mcapUsd - 3700) < 1);
  assert.ok(r.reasons.some((x) => /sold within 10 min/.test(x)));
});

test('rateOperator: runner history → bullish with sensible P25/P50/P75 targets', () => {
  const launches = [
    launch(180_000, { now: 90_000, ttp: 90, exit: { sells: 1, firstSellMin: 120, peakShareAtFirstSell: 0.9, mcapAtFirstSellUsd: 160_000 } }),
    launch(420_000, { now: 300_000, ttp: 240, exit: { sells: 2, firstSellMin: 200, peakShareAtFirstSell: 0.8, mcapAtFirstSellUsd: 350_000 } }),
    launch(95_000, { now: 20_000, ttp: 45, exit: { sells: 1, firstSellMin: 60, peakShareAtFirstSell: 0.95, mcapAtFirstSellUsd: 90_000 } }),
    launch(1_200_000, { now: 600_000, ttp: 600, exit: null }),
  ];
  const r = rateOperator(launches, { marketCapUsd: 30_000 });
  assert.ok(r.score >= 65, `score ${r.score}`);
  assert.equal(r.label, 'Bullish bundle');
  assert.ok(r.exit.conservative.mcapUsd < r.exit.base.mcapUsd && r.exit.base.mcapUsd < r.exit.stretch.mcapUsd);
  assert.ok(Math.abs(r.exit.base.mcapUsd - 300_000) < 1, 'median of 95k,180k,420k,1.2M = 300k');
  assert.ok(r.exit.base.multiple > 9.9 && r.exit.base.multiple < 10.1);
  assert.equal(r.exit.conservative.reached, false);
});

test('rateOperator: no history → unrated', () => {
  const r = rateOperator([]);
  assert.equal(r.score, null);
  assert.equal(r.label, 'Unrated');
});

test('computeScore: bearish operator flips the verdict even without a bundle', () => {
  const events = [ev({ wallet: 'DEV', isCreator: true, tokens: 76_000_000, sol: 2.3 })];
  for (let i = 0; i < 5; i++) events.push(ev({ wallet: W(i), slotOffset: 0, index: i, tokens: 10_000_000 }));
  const a = analyseLaunch(events, { supply: SUPPLY });
  applyWalletKinds(a, Array.from({ length: 5 }, (_, i) => ({ wallet: W(i), kind: 'sniper' })));
  const op = rateOperator([
    launch(4800, { now: 2900, ttp: 2, exit: { sells: 3, firstSellMin: 2, peakShareAtFirstSell: 0.8, mcapAtFirstSellUsd: 3700 } }),
    launch(4900, { now: 2900, ttp: 1, exit: { sells: 2, firstSellMin: 2, peakShareAtFirstSell: 0.7, mcapAtFirstSellUsd: 3600 } }),
  ]);
  const s = computeScore({ launch: a, wallets: { summary: { behaviouralLinkScore: 0, reasons: [] } }, operator: op });
  assert.equal(s.verdict.tone, 'bearish');
  assert.match(s.verdict.headline, /Serial dumper/);
  assert.equal(s.parts.length, 4);
  assert.ok(s.score >= 0 && s.score <= 100);
});

test('computeScore: heavy bundle + bullish operator → bullish tone', () => {
  const events = [ev({ wallet: 'DEV', isCreator: true, tokens: 30_000_000, sol: 1 })];
  for (let i = 0; i < 10; i++) events.push(ev({ wallet: W(i), slotOffset: 0, index: i, tokens: 20_000_000, jitoTip: 1000, tipAccount: 'x' }));
  const a = analyseLaunch(events, { supply: SUPPLY });
  applyWalletKinds(a, Array.from({ length: 10 }, (_, i) => ({ wallet: W(i), kind: 'bundle' })));
  const op = rateOperator([launch(400_000, { ttp: 120 }), launch(250_000, { ttp: 90 }), launch(900_000, { ttp: 300 })]);
  const s = computeScore({ launch: a, operator: op });
  assert.equal(s.verdict.tone, 'bullish');
  assert.match(s.verdict.headline, /Bundled: 20%/);
  assert.ok(s.score >= 40);
});

test('trackCluster detects coordinated exits and hand-offs with a mock RPC', async () => {
  const mint = 'MINT';
  const launchT = 1_000_000;
  const recs = {
    A1: sellTx('A', mint, launchT + 300, 5_000_000, 0.2),
    B1: sellTx('B', mint, launchT + 303, 7_000_000, 0.3),
    C1: transferTx('C', 'Z', mint, launchT + 900, 9_000_000),
  };
  const rpc = {
    async getTokenBalances(owners) {
      return owners.map((o) => ({ owner: o, amount: o === 'Z' ? 9_000_000 : o === 'A' ? 0 : o === 'B' ? 3_000_000 : 0 }));
    },
    async ataFor(owner) {
      return `ATA_${owner}`; // activity is read from the wallet's token account for this mint
    },
    async getSignaturesForAddress(addr) {
      const w = addr.replace(/^ATA_/, '');
      return Object.entries(recs)
        .filter(([k]) => k.startsWith(w))
        .map(([k, r]) => ({ signature: k, blockTime: r.blockTime, err: null }));
    },
    async getTransactions(sigs) {
      return sigs.map((s) => recs[s]);
    },
  };
  const cluster = [
    { wallet: 'A', tokens: 5_000_000 },
    { wallet: 'B', tokens: 10_000_000 },
    { wallet: 'C', tokens: 9_000_000 },
  ];
  const out = await trackCluster(rpc, mint, cluster, { launchTimeSec: launchT, supply: SUPPLY });
  assert.equal(out.exitEvents.length, 1, 'A and B sold within 10s');
  assert.equal(out.exitEvents[0].wallets, 2);
  assert.equal(out.handoffs.length, 1);
  assert.equal(out.handoffs[0].to, 'Z');
  assert.equal(out.summary.firstClusterSellMin, 5);
  assert.ok(Math.abs(out.summary.clusterHoldsPct - 1.2) < 1e-9, 'B 3M + Z 9M = 1.2% of supply');
  assert.ok(Math.abs(out.summary.clusterSoldPct - 1.2) < 1e-9, 'A 5M + B 7M = 1.2% sold');
});

function baseTx(signer, blockTime) {
  return {
    slot: 1,
    blockTime,
    meta: { err: null, fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [1_000_000_000, 0], preTokenBalances: [], postTokenBalances: [], innerInstructions: [] },
    transaction: { signatures: ['x'], message: { accountKeys: [{ pubkey: signer, signer: true }, { pubkey: PROGRAMS.PUMP }], instructions: [] } },
  };
}
function sellTx(signer, mint, blockTime, tokens, sol) {
  const tx = baseTx(signer, blockTime);
  tx.meta.postBalances = [1_000_000_000 + sol * 1e9, 0];
  tx.transaction.message.accountKeys.push({ pubkey: 'ATA_' + signer });
  tx.meta.preTokenBalances = [{ accountIndex: 2, mint, owner: signer, uiTokenAmount: { uiAmount: tokens } }];
  tx.meta.postTokenBalances = [{ accountIndex: 2, mint, owner: signer, uiTokenAmount: { uiAmount: 0 } }];
  tx.transaction.message.instructions = [{ programId: PROGRAMS.PUMP, accounts: ['g', 'f', mint, 'bc', 'abc', 'ATA_' + signer, signer], data: encodeSell(tokens) }];
  return tx;
}
function transferTx(from, to, mint, blockTime, tokens) {
  const tx = baseTx(from, blockTime);
  tx.transaction.message.accountKeys.push({ pubkey: 'ATA_' + from }, { pubkey: 'ATA_' + to });
  tx.meta.preTokenBalances = [{ accountIndex: 2, mint, owner: from, uiTokenAmount: { uiAmount: tokens } }, { accountIndex: 3, mint, owner: to, uiTokenAmount: { uiAmount: 0 } }];
  tx.meta.postTokenBalances = [{ accountIndex: 2, mint, owner: from, uiTokenAmount: { uiAmount: 0 } }, { accountIndex: 3, mint, owner: to, uiTokenAmount: { uiAmount: tokens } }];
  tx.transaction.message.instructions = [{ program: 'spl-token', programId: PROGRAMS.TOKEN, parsed: { type: 'transfer', info: { source: 'ATA_' + from, destination: 'ATA_' + to, authority: from, amount: String(tokens * 1e6) } } }];
  return tx;
}
function encodeSell(tokens) {
  // sell discriminator + amount u64 + min_sol u64, base58-encoded
  const bytes = new Uint8Array(24);
  bytes.set([51, 230, 133, 164, 1, 127, 131, 173], 0);
  let v = BigInt(Math.round(tokens * 1e6));
  for (let i = 0; i < 8; i++) {
    bytes[8 + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b58(bytes);
}
function b58(bytes) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = A[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

test('OperatorMemory indexes wallets ↔ launches and TtlCache expires', async () => {
  const store = new MemoryStore();
  const mem = new OperatorMemory(store);
  await mem.remember('MINT1', { creator: 'DEV', wallets: ['A', 'B'], createdAt: 1, windowPct: 12 });
  await mem.remember('MINT2', { creator: 'DEV', wallets: ['B', 'C'], createdAt: 2, windowPct: 8 });
  const dev = await mem.getWalletLaunches('DEV');
  assert.equal(dev.length, 2);
  assert.equal(dev[0].role, 'creator');
  assert.equal((await mem.getWalletLaunches('B')).length, 2);
  assert.equal((await mem.getWalletLaunches('A')).length, 1);
  const st = await mem.stats();
  assert.equal(st.tokens, 2);
  const cache = new TtlCache(store, 't:');
  await cache.set('k', { v: 1 }, 10);
  assert.deepEqual(await cache.get('k'), { v: 1 });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(await cache.get('k'), undefined);
});

test('rateOperator: single prior launch is flagged thin, single-peak exit, history-exceeded', () => {
  const r = rateOperator([launch(4600, { now: 2900, ttp: 0, exit: { sells: 1, firstSellMin: 0, peakShareAtFirstSell: 0.91, mcapAtFirstSellUsd: 4200 } })], { marketCapUsd: 89_000 });
  assert.equal(r.thin, true);
  assert.equal(r.exit.single, true);
  assert.equal(r.exit.launches, 1);
  assert.equal(r.historyExceeded, true, 'current mcap far above the only prior peak');
  assert.equal(r.exit.base.reached, true);
  assert.match(r.label, /1 launch/);
  const many = rateOperator([launch(50_000), launch(80_000), launch(120_000)], { marketCapUsd: 10_000 });
  assert.equal(many.thin, false);
  assert.equal(many.historyExceeded, false);
  assert.ok(many.exit.highest.mcapUsd === 120_000);
});
