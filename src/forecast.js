/* Day Rate forecast: the expected value (EV) of each rating on a given day, as an equation.
   Pure functions: no DOM, no storage, no randomness. Input: entries {'YYYY-MM-DD': {m,p,c}}, a target date.
   Only days BEFORE the target are used, so the same call gives an honest "what was expected" for a past day.

   For each rating k in {m (mood), p (productivity), c (connection)}, with z = (rating - mu_k) / sigma_k:

     EV_k(T) = clip( mu_k + sigma_k * ( delta_k[dow(T)] + yhat_k + rho_k ), 1, 10 )

     mu_k, sigma_k   recency-weighted long-run mean and spread (baseline, half-life HALF_LIFE days)
     delta_k[dow]    weekday effect, shrunk toward 0 (similar weekday history)
     yhat_k          ridge regression on the deseasonalised state: recent averages, momentum, streak continuation
                     probability, pull toward the mean, recovery asymmetry, weekday-after-state effects and the
                     other two ratings (same state, lagged). Weights are learned from this person's own history;
                     the penalty is chosen by leave-one-out error, so correlated signals share credit instead of
                     being counted twice.
     rho_k           analog correction: kernel average of the regression's leave-one-out errors on the most similar
                     past days (state, streak, momentum, weekday, week-so-far path). It only explains what the
                     regression missed, so nothing is counted twice.

   Spread: sd = sqrt(LOO mean squared error * (1 + leverage)), widened when the latest rated day is not the day before.
   Confidence: 100 * n/(n+20) * (1 - sd/3), a rating not a probability. See FORECAST.md. */

export const CFG = {
  minDays: 7, // rated days before any forecast
  minRows: 21, // consecutive-day pairs before the regression is fitted
  maxRows: 365, // most recent pairs used for fitting
  halfLife: 60, // days, baseline mean and spread
  rowHalfLife: 120, // days, recency weight of regression rows
  sdFloor: 0.6, // rating points
  dowShrink: 4, // pseudo-days pulling a weekday effect to 0
  condShrink: 3, // pseudo-days for weekday-after-state effects
  streakShrink: 4, // pseudo-days pulling a streak's continuation rate to the base rate
  lambdas: [1, 3, 10, 30, 100, 300, 1000],
  priorA7: 0.4, // weight on the 7-day average before there is enough data to fit
  analogK: [5, 12], // neighbours: sqrt(rows) clamped to this range
  analogShrink: 6, // pseudo-neighbours with zero correction
  ruleWeights: { similar: 0.4, trajectory: 0.2, streak: 0.15, weekday: 0.1, reversion: 0.1, cross: 0.05 }, // transparent rules-based version
  z80: 1.2816, // 80% interval
  preliminary: 30, // days below which results are labelled preliminary
  confN: 20, // data term n/(n+confN)
  confSd: 3, // rating-point spread that gives zero precision
};
export const KEYS = ['m', 'p', 'c'];
export const NAMES = { m: 'Mood', p: 'Productivity', c: 'Connection' };
const DAY = 864e5;
export const dn = (k) => { const [a, b, c] = k.split('-').map(Number); return Math.round(Date.UTC(a, b - 1, c) / DAY); };
export const dowOf = (n) => (n + 3) % 7; // Monday = 0
const DOWN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const sgn = (x, dead) => (x > dead ? 1 : x < -dead ? -1 : 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const isN = (x) => x === x; // not NaN

/* ---------- small linear algebra ---------- */
function inv(A) {
  const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    const d = M[i][i] || 1e-12;
    for (let j = 0; j < 2 * n; j++) M[i][j] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[i][j]; }
  }
  return M.map((r) => r.slice(n));
}
const quad = (x, A) => { let s = 0; for (let i = 0; i < x.length; i++) { let t = 0; for (let j = 0; j < x.length; j++) t += A[i][j] * x[j]; s += x[i] * t; } return s; };

/* Weighted ridge with centred, standardised columns. Penalty picked by weighted leave-one-out error;
   the intercept-only model competes, so noise cannot beat "no signal". */
export function ridge(X, y, v, lambdas = CFG.lambdas) {
  const n = X.length, p = X[0].length;
  let sv = 0, yb = 0; for (let i = 0; i < n; i++) { sv += v[i]; yb += v[i] * y[i]; } yb /= sv;
  const xb = new Array(p).fill(0), s = new Array(p).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) xb[j] += v[i] * X[i][j];
  for (let j = 0; j < p; j++) xb[j] /= sv;
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) s[j] += v[i] * (X[i][j] - xb[j]) ** 2;
  for (let j = 0; j < p; j++) s[j] = Math.sqrt(s[j] / sv) || 1e-9;
  const Z = X.map((r) => r.map((x, j) => (x - xb[j]) / s[j])), yc = y.map((t) => t - yb);
  const G = Array.from({ length: p }, () => new Array(p).fill(0)), c = new Array(p).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { c[a] += v[i] * Z[i][a] * yc[i]; for (let b = a; b < p; b++) G[a][b] += v[i] * Z[i][a] * Z[i][b]; }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) G[a][b] = G[b][a];
  const wmse = (e) => { let t = 0; for (let i = 0; i < n; i++) t += v[i] * e[i] * e[i]; return t / sv; };
  const e0 = yc.map((t, i) => t / (1 - Math.min(0.95, v[i] / sv)));
  let best = { beta: new Array(p).fill(0), Ai: null, lambda: Infinity, mse: wmse(e0), e: e0 };
  for (const lam of lambdas) {
    const Ai = inv(G.map((r, a) => r.map((x, b) => x + (a === b ? lam : 0)))), beta = Ai.map((r) => r.reduce((t, x, b) => t + x * c[b], 0)), e = new Array(n);
    for (let i = 0; i < n; i++) { const h = Math.min(0.95, v[i] * (1 / sv + quad(Z[i], Ai))); e[i] = (yc[i] - Z[i].reduce((t, z, j) => t + z * beta[j], 0)) / (1 - h); }
    const mse = wmse(e);
    if (mse < best.mse) best = { beta, Ai, lambda: lam, mse, e };
  }
  return { ...best, xb, s, yb, sv, p };
}
function predictRidge(m, x) {
  const z = x.map((t, j) => (t - m.xb[j]) / m.s[j]), parts = z.map((t, j) => t * m.beta[j]);
  return { yhat: m.yb + parts.reduce((a, b) => a + b, 0), parts, lev: 1 / m.sv + (m.Ai ? quad(z, m.Ai) : 0) };
}

/* ---------- model ---------- */
const FEAT = [ // name, family (family labels are what the "why" lines show)
  ['a3', 'level'], ['a7-a3', 'level'], ['a30-a7', 'level'], ['slope', 'momentum'], ['excess+', 'reversion'], ['excess-', 'reversion'],
  ['streak level', 'streak'], ['streak direction', 'streak'], ['weekday after state', 'weekdaypat'], ['weekday in week state', 'weekdaypat'],
  ['other1 lag1', 'others'], ['other1 lag2', 'others'], ['other2 lag1', 'others'], ['other2 lag2', 'others'],
];
export const FAMILY = {
  level: 'your recent days compared with your average', momentum: 'the direction your ratings have been moving', reversion: 'the pull back toward your average',
  streak: 'your current streak', weekdaypat: 'how this weekday follows similar days', others: 'your other two ratings',
  weekday: 'the day of the week', analog: 'the most similar past days', baseline: 'your average',
};

function build(entries, T) {
  const days = [];
  for (const k of Object.keys(entries)) {
    const e = entries[k], n = dn(k);
    if (n < T && e && [e.m, e.p, e.c].every((x) => Number.isFinite(x))) days.push({ n, v: [e.m, e.p, e.c] });
  }
  days.sort((a, b) => a.n - b.n);
  return days;
}

function baselines(days, last) {
  const mu = [], sd = [];
  for (let k = 0; k < 3; k++) {
    let sw = 0, sx = 0;
    for (const d of days) { const w = 0.5 ** ((last - d.n) / CFG.halfLife); sw += w; sx += w * d.v[k]; }
    const m = sx / sw; let sq = 0;
    for (const d of days) sq += 0.5 ** ((last - d.n) / CFG.halfLife) * (d.v[k] - m) ** 2;
    mu.push(m); sd.push(Math.max(CFG.sdFloor, Math.sqrt(sq / sw)));
  }
  return { mu, sd };
}

/* Continuation tables are updated in time order, so a day's streak feature only uses what was known then. */
const mkTab = () => ({ c: {}, t: {}, base: { '1': 1, '-1': 1 }, tot: 2 });
function streakF(tab, s, len, cap) {
  if (!s || !len) return 0;
  const b = Math.min(len, cap), key = s + ':' + b, base = tab.base[s] / tab.tot, c = tab.c[key] || 0, t = tab.t[key] || 0;
  return s * ((c + CFG.streakShrink * base) / (t + CFG.streakShrink) - base);
}
function streakUpdate(tab, s, len, cap, nextSign) {
  tab.tot++; if (nextSign) tab.base[nextSign]++;
  if (!s || !len) return;
  const key = s + ':' + Math.min(len, cap);
  tab.t[key] = (tab.t[key] || 0) + 1; if (nextSign === s) tab.c[key] = (tab.c[key] || 0) + 1;
}

export function forecast(entries, target) {
  const T = typeof target === 'string' ? dn(target) : target, days = build(entries, T);
  if (days.length < CFG.minDays) return { ok: false, reason: 'need', need: CFG.minDays - days.length, n: days.length };
  const first = days[0].n, last = days[days.length - 1].n, qi = T - 1 - first, L = qi + 1, { mu, sd } = baselines(days, last);
  const Z = [0, 1, 2].map(() => new Array(L).fill(NaN));
  for (const d of days) for (let k = 0; k < 3; k++) Z[k][d.n - first] = (d.v[k] - mu[k]) / sd[k];
  /* weekday effects, shrunk toward 0 */
  const delta = [0, 1, 2].map((k) => { const s = new Array(7).fill(0), c = new Array(7).fill(0); for (const d of days) { const w = dowOf(d.n); s[w] += Z[k][d.n - first]; c[w]++; } return s.map((x, w) => x / (c[w] + CFG.dowShrink)); });
  const Y = [0, 1, 2].map((k) => Z[k].map((z, i) => (isN(z) ? z - delta[k][dowOf(first + i)] : NaN)));
  const g = (k, i) => (i >= 0 && i < L ? Y[k][i] : NaN);
  const win = (k, i, len) => { let s = 0, c = 0; for (let j = i - len + 1; j <= i; j++) { const x = g(k, j); if (isN(x)) { s += x; c++; } } return c ? s / c : 0; };
  /* run lengths, level (above/below baseline) and direction (rising/falling) */
  const lS = [0, 1, 2].map(() => new Array(L).fill(0)), lL = [0, 1, 2].map(() => new Array(L).fill(0)), dS = [0, 1, 2].map(() => new Array(L).fill(0)), dL = [0, 1, 2].map(() => new Array(L).fill(0));
  for (let k = 0; k < 3; k++) for (let i = 0; i < L; i++) {
    const y = Y[k][i]; if (!isN(y)) continue;
    lS[k][i] = sgn(y, 0.1); lL[k][i] = lS[k][i] ? (i && lS[k][i - 1] === lS[k][i] ? lL[k][i - 1] + 1 : 1) : 0;
    const yp = g(k, i - 1); dS[k][i] = isN(yp) ? sgn(y - yp, 0.05) : 0; dL[k][i] = dS[k][i] ? (i && dS[k][i - 1] === dS[k][i] ? dL[k][i - 1] + 1 : 1) : 0;
  }
  const tabL = [mkTab(), mkTab(), mkTab()], tabD = [mkTab(), mkTab(), mkTab()];
  const condA = [0, 1, 2].map(() => ({})), condB = [0, 1, 2].map(() => ({}));
  const cf = (tab, key) => { const o = tab[key]; return o ? o.s / (o.c + CFG.condShrink) : 0; };
  const monOf = (i) => i - dowOf(first + i); // index of that week's Monday
  /* state at day i (the day before the day being predicted); works for an unrated day i (missing = neutral) */
  const state = (i) => {
    const t = i + 1, w = dowOf(first + t), ok = [0, 1, 2].map((k) => isN(g(k, i))), S = [];
    for (let k = 0; k < 3; k++) {
      const a3 = win(k, i, 3), a7 = win(k, i, 7), a30 = win(k, i, 30), y = ok[k] ? Y[k][i] : 0;
      const p1 = g(k, i - 1), p2 = g(k, i - 2);
      const slope = !ok[k] ? 0 : isN(p2) ? (y - p2) / 2 : isN(p1) ? y - p1 : 0;
      S.push({
        a3, a7, a30, slope, xp: Math.max(0, y - 1), xn: Math.min(0, y + 1), lag1: y, lag2: isN(p1) ? p1 : 0,
        lvl: ok[k] ? streakF(tabL[k], lS[k][i], lL[k][i], 10) : 0, dir: ok[k] ? streakF(tabD[k], dS[k][i], dL[k][i], 6) : 0,
        dp: cf(condA[k], w + ':' + (y >= 0 ? 1 : 0)), dw: cf(condB[k], w + ':' + (a7 >= 0 ? 1 : 0)),
      });
    }
    const m0 = monOf(t), path = [];
    for (let j = 0; j < w; j++) path.push([0, 1, 2].map((k) => g(k, m0 + j)));
    const wtd = [0, 1, 2].map((k) => { let s = 0, c = 0; for (const p of path) if (isN(p[k])) { s += p[k]; c++; } return c ? s / c : 0; });
    return { S, w, path, wtd, dow: w };
  };
  const feat = (st, k) => {
    const o = st.S[k], oth = [0, 1, 2].filter((j) => j !== k);
    return [o.a3, o.a7 - o.a3, o.a30 - o.a7, o.slope, o.xp, o.xn, o.lvl, o.dir, o.dp, o.dw, st.S[oth[0]].lag1, st.S[oth[0]].lag2, st.S[oth[1]].lag1, st.S[oth[1]].lag2];
  };
  const desc = (st) => [0, 1, 2].map((k) => st.S[k].a3).concat([0, 1, 2].map((k) => st.S[k].slope), [0, 1, 2].map((k) => st.S[k].lvl * 4), st.wtd);
  const rows = []; let seen = 0;
  for (let i = 0; i < L - 1 && i <= last - first; i++) {
    if (!isN(Y[0][i])) continue;
    seen++;
    if (isN(Y[0][i + 1]) && seen >= 3) {
      const st = state(i); st.i = i; st.y = [0, 1, 2].map((k) => Y[k][i + 1]); st.x = [0, 1, 2].map((k) => feat(st, k)); st.u = desc(st); st.td = first + i + 1; rows.push(st);
    }
    if (isN(Y[0][i + 1])) { /* learn from the transition i -> i+1 */
      const w = dowOf(first + i + 1);
      for (let k = 0; k < 3; k++) {
        streakUpdate(tabL[k], lS[k][i], lL[k][i], 10, lS[k][i + 1]); streakUpdate(tabD[k], dS[k][i], dL[k][i], 6, dS[k][i + 1]);
        const a7 = win(k, i, 7), ka = w + ':' + (Y[k][i] >= 0 ? 1 : 0), kb = w + ':' + (a7 >= 0 ? 1 : 0);
        for (const [tb, key] of [[condA[k], ka], [condB[k], kb]]) { const o = tb[key] || (tb[key] = { s: 0, c: 0 }); o.s += Y[k][i + 1]; o.c++; }
      }
    }
  }
  const q = state(qi); q.u = desc(q);
  const dq = dowOf(T), gap = T - last, use = rows.slice(-CFG.maxRows), nUse = use.length;
  const prelim = days.length < CFG.preliminary, fitted = nUse >= CFG.minRows;
  /* analog neighbours, shared by the three ratings */
  let nb = null;
  if (fitted) {
    const U = q.u.length, S = new Array(U).fill(0), mean = new Array(U).fill(0);
    for (const r of use) for (let f = 0; f < U; f++) mean[f] += r.u[f] / nUse;
    for (const r of use) for (let f = 0; f < U; f++) S[f] += (r.u[f] - mean[f]) ** 2 / nUse;
    for (let f = 0; f < U; f++) S[f] = Math.max(0.05, Math.sqrt(S[f]));
    const cls = (w) => (w >= 5 ? 1 : 0);
    nb = use.map((r, idx) => {
      let s = 0; for (let f = 0; f < U; f++) s += ((q.u[f] - r.u[f]) / S[f]) ** 2; s /= U;
      let ps = 0, pc = 0; const ov = Math.min(q.w, r.w);
      for (let j = 0; j < ov; j++) for (let k = 0; k < 3; k++) { const a = q.path[j][k], b = r.path[j][k]; if (isN(a) && isN(b)) { ps += (a - b) ** 2; pc++; } }
      if (pc >= 2) s += ps / pc;
      s += q.dow === r.dow ? 0 : cls(q.dow) === cls(r.dow) ? 0.5 : 1.5;
      return { idx, d: s };
    }).sort((a, b) => a.d - b.d);
    const K = clamp(Math.round(Math.sqrt(nUse)), CFG.analogK[0], CFG.analogK[1]), top = nb.slice(0, K), h2 = Math.max(1e-6, top.reduce((a, b) => a + b.d, 0) / top.length);
    nb = top.map((t) => ({ idx: t.idx, k: Math.exp(-t.d / (2 * h2)) }));
  }
  /* ---- rules-based version: six readable estimates, each in rating points, combined with fixed weights ---- */
  const byN = new Map(days.map((d) => [d.n, d.v]));
  const wmean = (list, k) => { let a = 0, w = 0; for (const t of list) { a += t.k * byN.get(use[t.idx].td)[k]; w += t.k; } return w ? a / w : null; };
  let trj = null; /* weeks that started like this one: same weekday, nearest week-so-far path */
  if (fitted && q.w >= 1) {
    const c = [];
    use.forEach((r, idx) => {
      if (r.w !== q.w) return;
      let ps = 0, pc = 0; for (let j = 0; j < q.w; j++) for (let k = 0; k < 3; k++) { const a = q.path[j][k], b = r.path[j][k]; if (isN(a) && isN(b)) { ps += (a - b) ** 2; pc++; } }
      if (pc >= 2) c.push({ idx, d: ps / pc });
    });
    if (c.length >= 3) { c.sort((a, b) => a.d - b.d); const top = c.slice(0, Math.min(5, c.length)), h2 = Math.max(1e-6, top.reduce((a, b) => a + b.d, 0) / top.length); trj = top.map((t) => ({ idx: t.idx, k: Math.exp(-t.d / (2 * h2)) })); }
  }
  const rulesFor = (k, mean, spread, wd) => {
    const W = CFG.ruleWeights, parts = [], add = (key, label, est, text) => { if (est != null && Number.isFinite(est)) parts.push({ key, label, weight: W[key], est, text }); };
    add('similar', 'Similar days', wmean(nb, k), 'similar days averaged ' + f1(wmean(nb, k) ?? 0));
    if (trj) add('trajectory', 'Week so far', wmean(trj, k), 'weeks that started like this one averaged ' + f1(wmean(trj, k)));
    const sg = lS[k][qi], ln = lL[k][qi];
    if (sg && ln) {
      const tab = tabL[k], key = sg + ':' + Math.min(ln, 10), base = tab.base[sg] / tab.tot, P = ((tab.c[key] || 0) + CFG.streakShrink * base) / ((tab.t[key] || 0) + CFG.streakShrink);
      let a = 0, na = 0, b = 0, nb2 = 0;
      for (const d of days) { const sd2 = lS[k][d.n - first]; if (sd2 === sg) { a += d.v[k]; na++; } else if (sd2 === -sg) { b += d.v[k]; nb2++; } }
      if (na && nb2) add('streak', 'Streak', P * (a / na) + (1 - P) * (b / nb2), 'your ' + ln + '-day run ' + (sg > 0 ? 'above' : 'below') + ' your average goes on ' + Math.round(P * 100) + '% of the time');
    }
    const w$ = spread * wd;
    add('weekday', 'Weekday', mean + w$, Math.abs(w$) >= 0.15 ? DOWN[dq] + 's usually run ' + f1(Math.abs(w$)) + (w$ > 0 ? ' above' : ' below') + ' your average' : DOWN[dq] + 's are close to your average');
    add('reversion', 'Mean reversion', mean, 'your long-run average is ' + f1(mean));
    const oth = [0, 1, 2].filter((j) => j !== k), cm = ridge(use.map((r) => [r.x[k][10], r.x[k][12]]), use.map((r) => r.y[k]), use.map(() => 1)), cp = predictRidge(cm, [q.S[oth[0]].lag1, q.S[oth[1]].lag1]);
    add('cross', 'Other ratings', mean + spread * cp.yhat, 'your other two ratings point to ' + f1(mean + spread * cp.yhat));
    let tw = 0, ev = 0; for (const x of parts) { tw += x.weight; ev += x.weight * x.est; }
    if (!tw) return null;
    ev = clamp(ev / tw, 1, 10);
    parts.forEach((x) => { x.share = x.weight / tw; });
    const because = parts.slice().sort((x, y) => y.share - x.share).slice(0, 3).map((x) => x.text);
    return { ev, parts, because: because.length > 1 ? because.slice(0, -1).join(', ') + ' and ' + because[because.length - 1] : because[0] };
  };
  const out = { ok: true, target: T, n: days.length, rows: nUse, prelim, gap, metrics: {} };
  for (let k = 0; k < 3; k++) {
    const x = feat(q, k);
    let yhat, sdZ, parts = {}, lambda = null, rho = 0;
    if (fitted) {
      const X = use.map((r) => r.x[k]), y = use.map((r) => r.y[k]), v = use.map((r) => 0.5 ** ((use[nUse - 1].td - r.td) / CFG.rowHalfLife));
      const m = ridge(X, y, v), pr = predictRidge(m, x);
      yhat = pr.yhat; lambda = m.lambda;
      pr.parts.forEach((p, j) => { parts[FEAT[j][1]] = (parts[FEAT[j][1]] || 0) + p; });
      let sk = 0, sw = 0; for (const t of nb) { sk += t.k * m.e[t.idx]; sw += t.k; }
      rho = sk / (sw + CFG.analogShrink);
      sdZ = Math.sqrt(m.mse * (1 + pr.lev));
      parts.baseline = m.yb;
    } else { /* too little history to fit: the prior weight on the 7-day average, full spread */
      yhat = CFG.priorA7 * q.S[k].a7; parts.level = yhat; parts.baseline = 0;
      let s = 0, c = 0; for (let i = 0; i < L; i++) if (isN(Y[k][i])) { s += Y[k][i] ** 2; c++; } sdZ = Math.sqrt((s / c) * 1.1) || 1;
    }
    const wd = delta[k][dq];
    if (gap > 1) sdZ = Math.sqrt(sdZ ** 2 + Math.max(0, 1 - sdZ ** 2) * (1 - 0.7 ** (gap - 1))); /* widen toward the unconditional spread */
    const zhat = wd + yhat + rho, ev = clamp(mu[k] + sd[k] * zhat, 1, 10), sdR = sd[k] * sdZ;
    const contrib = { baseline: mu[k] + sd[k] * (parts.baseline || 0), weekday: sd[k] * wd, analog: sd[k] * rho };
    for (const f of Object.keys(parts)) if (f !== 'baseline') contrib[f] = sd[k] * parts[f];
    const drivers = Object.entries(contrib).filter(([f, v]) => f !== 'baseline' && Math.abs(v) >= 0.15 && FAMILY[f]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([f, v]) => ({ family: f, label: FAMILY[f], points: v }));
    const D = nUse / (nUse + CFG.confN), P = clamp(1 - sdR / CFG.confSd, 0, 1), conf = Math.round(100 * D * P);
    out.metrics[KEYS[k]] = {
      ev, lo: clamp(ev - CFG.z80 * sdR, 1, 10), hi: clamp(ev + CFG.z80 * sdR, 1, 10), sd: sdR, conf, confLabel: conf >= 55 ? 'High' : conf >= 30 ? 'Medium' : 'Low',
      mean: mu[k], spread: sd[k], lambda, fitted, parts: contrib, drivers,
      rules: fitted ? rulesFor(k, mu[k], sd[k], wd) : null,
    };
  }
  return out;
}

/* ---------- accuracy over past days (each day forecast from the days before it) ---------- */
export function backtest(entries, dates) {
  const r = { m: [], p: [], c: [] };
  for (const d of dates) {
    const e = entries[d]; if (!e) continue;
    const f = forecast(entries, d); if (!f.ok || f.rows < CFG.minRows) continue;
    const h = build(entries, dn(d));
    KEYS.forEach((k, i) => { const m = f.metrics[k], avg = h.reduce((a, x) => a + x.v[i], 0) / h.length; r[k].push({ err: Math.abs(e[k] - m.ev), rules: m.rules ? Math.abs(e[k] - m.rules.ev) : null, naive: Math.abs(e[k] - avg), inside: e[k] >= m.lo - 0.5 && e[k] <= m.hi + 0.5 }); });
  }
  const res = {};
  for (const k of KEYS) { const a = r[k], n = a.length; res[k] = { n, mae: n ? a.reduce((s, x) => s + x.err, 0) / n : null, naive: n ? a.reduce((s, x) => s + x.naive, 0) / n : null, rules: n && a.every((x) => x.rules != null) ? a.reduce((s, x) => s + x.rules, 0) / n : null, coverage: n ? a.filter((x) => x.inside).length / n : null }; }
  return res;
}

/* ---------- recovery and run patterns (descriptive; the forecast learns the same effects through its features) ---------- */
export function patterns(entries, upTo) {
  const T = upTo == null ? Infinity : typeof upTo === 'string' ? dn(upTo) : upTo, days = build(entries, T);
  if (days.length < CFG.minDays) return null;
  const last = days[days.length - 1].n, { mu, sd } = baselines(days, last), res = {};
  KEYS.forEach((key, k) => {
    const by = new Map(days.map((d) => [d.n, (d.v[k] - mu[k]) / sd[k]]));
    let bad = 0, rec = 0, good = 0, fall = 0; const slumps = [], runs = []; let sl = 0, ru = 0;
    for (const d of days) {
      const z = by.get(d.n), nx = by.get(d.n + 1);
      if (z <= -1 && nx !== undefined) { bad++; if (nx >= -0.5) rec++; }
      if (z >= 1 && nx !== undefined) { good++; if (nx <= 0.5) fall++; }
      const prev = by.get(d.n - 1);
      if (z <= -0.5) { sl = prev !== undefined && prev <= -0.5 ? sl + 1 : 1; } else if (sl) { slumps.push(sl); sl = 0; }
      if (z >= 0.5) { ru = prev !== undefined && prev >= 0.5 ? ru + 1 : 1; } else if (ru) { runs.push(ru); ru = 0; }
    }
    if (sl) slumps.push(sl); if (ru) runs.push(ru);
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    res[key] = { lowDays: bad, recover: bad ? rec / bad : null, highDays: good, cooled: good ? fall / good : null, slumpLen: avg(slumps), slumps: slumps.length, runLen: avg(runs), runs: runs.length };
  });
  return res;
}
