// Solana JSON-RPC client with request batching, rate-limit handling, endpoint fallback and a few
// typed helpers. Adapts to endpoint quirks: Solana's public RPC rejects browser origins (HTTP 403),
// publicnode allows them but forbids batching getTransaction and "indexed" token methods.
import { fetchJson, chunk, pMap, HttpError, rateStats } from './http.js';
import { findProgramAddress } from './pda.js';
import { decodeBase58 } from './base58.js';
import { PROGRAMS } from './constants.js';

const TX_OPTS = { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' };

// Public endpoints that accept requests from browser extensions, tried in order after the user's own.
export const FALLBACK_RPCS = ['https://solana-rpc.publicnode.com'];
// Endpoints with deeper history, used only for data the primary has already pruned. Free tiers of
// browser-friendly RPCs keep ~14 h (publicnode) to ~30 h (ZAN); a Helius key gives full archive.
export const ARCHIVE_RPCS = ['https://api.zan.top/node/v1/solana/mainnet/public'];

// Errors that will not succeed on retry (slot skipped, tx not found in long-term storage, etc.)
function isFinalError(r) {
  return r?.code === -32007 || r?.code === -32009 || r?.code === -32004 || r?.code === -32015;
}

function profileFor(url) {
  if (/publicnode\.com/.test(url)) return { name: 'publicnode', batchTx: false, batchSize: 10, concurrency: 8, indexedMethods: false, multiAccountsMax: 10 };
  if (/zan\.top/.test(url)) return { name: 'zan', batchTx: true, batchSize: 10, concurrency: 2, indexedMethods: true };
  if (/api\.(mainnet-beta|devnet)\.solana\.com/.test(url)) return { name: 'solana-public', batchTx: true, batchSize: 10, concurrency: 2, indexedMethods: true };
  if (/helius/.test(url)) return { name: 'helius', batchTx: true, batchSize: 20, concurrency: 6, indexedMethods: true };
  return { name: 'custom', batchTx: true, batchSize: 20, concurrency: 5, indexedMethods: true };
}

export class RpcClient {
  constructor(url, { batchSize, concurrency, onStat, fallbacks = FALLBACK_RPCS, archives = ARCHIVE_RPCS, extraHeaders } = {}) {
    this.urls = [url, ...fallbacks.filter((u) => u !== url)];
    this.urlIndex = 0;
    this.switched = null; // { from, to, reason }
    this.calls = 0;
    this.degraded = 0; // requests that ultimately failed → report shows "partial"
    this.onStat = onStat;
    this.extraHeaders = extraHeaders || {};
    this._id = 1;
    this.rateLimited = 0; // 429s seen → concurrency is lowered adaptively
    this.failReasons = {}; // why requests ultimately failed, for the panel
    this.firstAvailableBlock = null; // oldest slot this endpoint still has (null = unknown, 0 = full archive)
    this.archiveUrls = archives.filter((u) => u !== url);
    this.archive = null; // lazily created deeper-history client
    this.isArchiveClient = false;
    this._applyProfile({ batchSize, concurrency });
  }
  /** Oldest slot this endpoint serves. Cached; 0 means full archive (Helius etc.). */
  async historyStart() {
    if (this.firstAvailableBlock != null) return this.firstAvailableBlock;
    try {
      const b = await this.call('getFirstAvailableBlock');
      this.firstAvailableBlock = typeof b === 'number' ? b : 0;
    } catch {
      this.firstAvailableBlock = 0;
    }
    // Pruned nodes report a first block slightly older than what they can actually serve; keep a margin.
    if (this.firstAvailableBlock > 0) this.firstAvailableBlock += 2000;
    return this.firstAvailableBlock;
  }
  async coversSlot(slot) {
    const start = await this.historyStart();
    return slot >= start;
  }
  /**
   * Client to use for data at `slot`: this endpoint if it still has it, else a deeper-history endpoint,
   * else null (caller shows the "add a Helius key" message). Also returns the hours of history available.
   */
  async forSlot(slot) {
    if (await this.coversSlot(slot)) return this;
    for (const u of this.archiveUrls) {
      if (!this.archive) {
        this.archive = new RpcClient(u, { fallbacks: [], archives: [], extraHeaders: this.extraHeaders, onStat: this.onStat });
        this.archive.isArchiveClient = true;
        this.archive.parent = this;
      }
      if (await this.archive.coversSlot(slot)) return this.archive;
    }
    return null;
  }
  /** Measured ms per slot (Solana's slot time has changed over the years; 2026 mainnet runs ~220 ms). */
  async slotTimeMs() {
    if (this._slotMs) return this._slotMs;
    try {
      const now = await this.getSlot();
      const back = 20000;
      const [t1, t0] = await Promise.all([this.getBlockTime(now - 50), this.getBlockTime(now - 50 - back)]);
      if (t1 && t0 && t1 > t0) this._slotMs = ((t1 - t0) * 1000) / back;
    } catch {
      /* fall back */
    }
    if (!this._slotMs || this._slotMs < 100 || this._slotMs > 1000) this._slotMs = 400;
    return this._slotMs;
  }
  /** Estimated slot for a unix-ms timestamp, using the measured slot time. */
  async slotForTimeMs(ms) {
    const [now, slotMs] = await Promise.all([this.getSlot(), this.slotTimeMs()]);
    return Math.round(now - (Date.now() - ms) / slotMs);
  }
  get totalCalls() {
    return this.calls + (this.archive?.calls || 0);
  }
  get totalDegraded() {
    return this.degraded + (this.archive?.degraded || 0);
  }
  /** Short human explanation of why requests failed, e.g. "rate-limited (HTTP 429) ×12". */
  get failSummary() {
    const all = { ...this.failReasons };
    for (const [k, v] of Object.entries(this.archive?.failReasons || {})) all[k] = (all[k] || 0) + v;
    return Object.entries(all)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k === 'HTTP 429' ? 'rate-limited (HTTP 429)' : k} ×${v}`)
      .join(', ');
  }
  get was429() {
    return rateStats.hits429 > 0;
  }
  get url() {
    return this.urls[this.urlIndex];
  }
  _applyProfile(overrides = {}) {
    this.profile = profileFor(this.url);
    this.batchSize = overrides.batchSize ?? this.profile.batchSize;
    this.concurrency = overrides.concurrency ?? this.profile.concurrency;
    this.batchTx = this.profile.batchTx;
    this.indexedMethods = this.profile.indexedMethods;
  }
  /** Move to the next endpoint (once per endpoint). Returns false when none are left. */
  _failover(reason) {
    if (this.urlIndex >= this.urls.length - 1) return false;
    const from = this.url;
    this.urlIndex++;
    this._applyProfile();
    this.switched = { from, to: this.url, reason };
    this.onStat?.({ failover: this.switched });
    return true;
  }
  _headers() {
    return { 'content-type': 'application/json', ...this.extraHeaders };
  }

  _noteFailure(e) {
    const k = e instanceof HttpError ? `HTTP ${e.status}` : e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error').slice(0, 40);
    this.failReasons[k] = (this.failReasons[k] || 0) + 1;
  }
  _onRateLimit() {
    this.rateLimited++;
    // Halve concurrency (min 2) the first few times we're throttled.
    if (this.rateLimited <= 3) this.concurrency = Math.max(2, Math.floor(this.concurrency / 2));
  }
  async call(method, params = []) {
    this.calls++;
    this.onStat?.({ method });
    let res;
    try {
      res = await fetchJson(this.url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ jsonrpc: '2.0', id: this._id++, method, params }),
        timeoutMs: 45000,
        retries: 4,
        onRateLimit: () => this._onRateLimit(),
      });
    } catch (e) {
      this._noteFailure(e);
      if (e instanceof HttpError && e.status === 403 && this._failover(`HTTP 403 from ${e.url} (blocks browser origins)`)) return this.call(method, params);
      // Network-level failure (DNS, blocked host, missing host permission, offline provider) → next endpoint
      if (!(e instanceof HttpError) && this._failover(`${this.url} unreachable (${e.name === 'AbortError' ? 'timeout' : e.message})`)) return this.call(method, params);
      throw e;
    }
    if (res?.error) {
      // Some gateways answer 200 with a 403-style error body.
      if (res.error.code === 403 && this._failover(`${res.error.message || 'access forbidden'} at ${this.url}`)) return this.call(method, params);
      const err = new Error(`${method}: ${res.error.message || JSON.stringify(res.error)}`);
      err.code = res.error.code;
      throw err;
    }
    return res?.result;
  }

  /**
   * Batched calls. reqs: [{method, params}] → results array (same order); failed items are {error}.
   * Falls back to individual calls when the endpoint rejects batches (or the batch limit is hit).
   */
  async batch(reqs) {
    if (!reqs.length) return [];
    if (reqs.every((r) => r.method === 'getTransaction') && !this.batchTx) return this._individually(reqs);
    const groups = chunk(reqs, this.batchSize);
    const groupResults = await pMap(
      groups,
      async (group) => {
        this.calls += group.length;
        this.onStat?.({ method: group[0].method, batch: group.length });
        const body = group.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params || [] }));
        let res;
        try {
          res = await fetchJson(this.url, { method: 'POST', headers: this._headers(), body: JSON.stringify(body), timeoutMs: 60000, retries: 4, onRateLimit: () => this._onRateLimit() });
        } catch (e) {
          this._noteFailure(e);
          if (e instanceof HttpError && e.status === 403 && this._failover(`HTTP 403 from ${e.url} (blocks browser origins)`)) return this.batch(group);
          if (e instanceof HttpError && e.status === 400 && /batch/i.test(e.body || '')) {
            if (group[0].method === 'getTransaction') this.batchTx = false;
            return this._individually(group);
          }
          return this._individually(group);
        }
        if (!Array.isArray(res)) {
          if (res?.error && /batch/i.test(res.error.message || '')) {
            if (group[0].method === 'getTransaction') this.batchTx = false;
            return this._individually(group);
          }
          if (res?.error?.code === 403 && this._failover(`${res.error.message} at ${this.url}`)) return this.batch(group);
          if (res?.error) return group.map(() => ({ error: res.error.message || 'rpc error' }));
          return this._individually(group);
        }
        const byId = new Map(res.map((r) => [r.id, r]));
        const out = group.map((_, i) => {
          const r = byId.get(i);
          if (!r) return { error: 'missing response' };
          if (r.error) return { error: r.error.message || JSON.stringify(r.error), code: r.error.code };
          return r.result;
        });
        // Retry individually anything that failed inside the batch (rate limits, transient errors).
        for (let i = 0; i < out.length; i++) {
          if (out[i] && typeof out[i] === 'object' && 'error' in out[i] && !isFinalError(out[i])) {
            await new Promise((r) => setTimeout(r, 250));
            try {
              out[i] = await this.call(group[i].method, group[i].params);
            } catch (e) {
              out[i] = { error: e.message, code: e.code };
              this.degraded++;
            }
          }
        }
        return out;
      },
      this.concurrency,
    );
    return groupResults.flat();
  }

  async _individually(reqs) {
    return pMap(
      reqs,
      async (r) => {
        try {
          return await this.call(r.method, r.params);
        } catch (e) {
          if (!isFinalError(e)) this.degraded++;
          return { error: e.message, code: e.code };
        }
      },
      this.concurrency,
    );
  }

  // ---- typed helpers ----
  getSlot() {
    return this.call('getSlot', [{ commitment: 'confirmed' }]);
  }
  getBlockTime(slot) {
    return this.call('getBlockTime', [slot]);
  }
  getTransaction(sig) {
    return this.call('getTransaction', [sig, TX_OPTS]);
  }
  getTransactions(sigs) {
    return this.batch(sigs.map((s) => ({ method: 'getTransaction', params: [s, TX_OPTS] })));
  }
  getSignaturesForAddress(address, { limit = 1000, before, until } = {}) {
    const opts = { limit, commitment: 'confirmed' };
    if (before) opts.before = before;
    if (until) opts.until = until;
    return this.call('getSignaturesForAddress', [address, opts]);
  }
  /**
   * Page back through signatures (newest → oldest) until `stop(sigInfo)` is true or `maxPages` hit.
   * Returns { sigs: oldest-first array, exhausted: bool, pages }.
   */
  async pageSignatures(address, { maxPages = 10, limit = 1000, stop } = {}) {
    let before;
    const all = [];
    let pages = 0;
    let exhausted = false;
    while (pages < maxPages) {
      const page = await this.getSignaturesForAddress(address, { limit, before });
      pages++;
      if (!page?.length) {
        exhausted = true;
        break;
      }
      all.push(...page);
      before = page[page.length - 1].signature;
      if (page.length < limit) {
        exhausted = true;
        break;
      }
      if (stop && stop(page[page.length - 1])) break;
    }
    all.reverse();
    return { sigs: all, exhausted, pages };
  }
  async getBlockAccounts(slot) {
    try {
      return await this.call('getBlock', [
        slot,
        { encoding: 'json', transactionDetails: 'accounts', rewards: false, maxSupportedTransactionVersion: 1, commitment: 'confirmed' },
      ]);
    } catch (e) {
      // -32007 slot skipped / -32009 not available (long-term storage) → treat as no block
      if (e.code === -32007 || e.code === -32009 || e.code === -32004) return null;
      throw e;
    }
  }
  getAccountInfo(address) {
    return this.call('getAccountInfo', [address, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  }
  /** Accounts in order; `null` = account does not exist, `undefined` = request failed. */
  async getMultipleAccounts(addresses) {
    // publicnode answers 403 to getMultipleAccounts with more than ~10 accounts
    const groups = chunk(addresses, this.profile?.multiAccountsMax || 100);
    const res = await this.batch(groups.map((group) => ({ method: 'getMultipleAccounts', params: [group, { encoding: 'jsonParsed', commitment: 'confirmed' }] })));
    const out = [];
    groups.forEach((g, i) => {
      const r = res[i];
      if (!r || r.error) out.push(...g.map(() => undefined));
      else out.push(...(r.value || g.map(() => null)));
    });
    return out;
  }
  /** Mint info (supply, decimals, token program) — getAccountInfo works everywhere, getTokenSupply doesn't. */
  async getMintInfo(mint) {
    const info = await this.getAccountInfo(mint);
    const v = info?.value;
    const parsed = v?.data?.parsed?.info;
    if (!parsed || v.data.parsed.type !== 'mint') return null;
    const decimals = Number(parsed.decimals ?? 6);
    return { supply: Number(parsed.supply) / 10 ** decimals, decimals, tokenProgram: v.owner };
  }
  async getTokenSupply(mint) {
    try {
      const m = await this.getMintInfo(mint);
      if (m) return { value: { uiAmount: m.supply, decimals: m.decimals } };
    } catch {
      /* fall through */
    }
    return this.call('getTokenSupply', [mint, { commitment: 'confirmed' }]);
  }
  /** Associated token account for owner+mint under the given token program. */
  async ataFor(owner, mint, tokenProgram = PROGRAMS.TOKEN) {
    const { address } = await findProgramAddress([decodeBase58(owner), decodeBase58(tokenProgram), decodeBase58(mint)], PROGRAMS.ATA);
    return address;
  }
  /**
   * Balances of `mint` for many owners. Preferred path derives each owner's ATA and reads them in one
   * getMultipleAccounts call (works on every endpoint); falls back to getTokenAccountsByOwner, which also
   * catches non-ATA token accounts, when the endpoint allows indexed queries.
   */
  async getTokenBalances(owners, mint, { tokenProgram } = {}) {
    if (tokenProgram) {
      try {
        const atas = await Promise.all(owners.map((o) => this.ataFor(o, mint, tokenProgram)));
        const accs = await this.getMultipleAccounts(atas);
        const out = owners.map((o, i) => {
          const a = accs[i];
          if (a === undefined) return { owner: o, amount: null, error: 'no response' };
          const amt = a?.data?.parsed?.info?.tokenAmount?.uiAmount;
          return { owner: o, amount: a ? Number(amt || 0) : 0, viaAta: true };
        });
        if (!this.indexedMethods || out.every((x) => x.amount !== null)) return out;
      } catch {
        /* fall back */
      }
    }
    if (!this.indexedMethods) return owners.map((o) => ({ owner: o, amount: null, error: 'indexed methods unavailable on this RPC' }));
    const res = await this.batch(
      owners.map((o) => ({
        method: 'getTokenAccountsByOwner',
        params: [o, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
      })),
    );
    return owners.map((o, i) => {
      const r = res[i];
      if (!r || r.error) return { owner: o, amount: null, error: r?.error };
      let amount = 0;
      for (const acc of r.value || []) amount += Number(acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
      return { owner: o, amount };
    });
  }
  async getTokenBalance(owner, mint, opts) {
    const [r] = await this.getTokenBalances([owner], mint, opts);
    return r?.amount ?? 0;
  }
  /** All token accounts owned by `owner` (any mint), both token programs. Needs an indexed RPC. */
  async getOwnerTokenMints(owner) {
    if (!this.indexedMethods) return [];
    const [a, b] = await this.batch([
      { method: 'getTokenAccountsByOwner', params: [owner, { programId: PROGRAMS.TOKEN }, { encoding: 'jsonParsed' }] },
      { method: 'getTokenAccountsByOwner', params: [owner, { programId: PROGRAMS.TOKEN_2022 }, { encoding: 'jsonParsed' }] },
    ]);
    const out = [];
    for (const r of [a, b]) {
      if (!r || r.error) continue;
      for (const acc of r.value || []) {
        const info = acc.account?.data?.parsed?.info;
        if (info?.mint) out.push({ mint: info.mint, amount: Number(info.tokenAmount?.uiAmount || 0) });
      }
    }
    return out;
  }
}
