export type GrangerResult = {
  fStatistic: number;
  pValue: number;
  lag: number;
  sampleSize: number;
  bic: number;
};

const DEFAULT_MAX_LAG = 7;
const MIN_SAMPLE = 60;

function matTranspose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T: number[][] = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

function matMul(A: number[][], B: number[][]): number[][] {
  const aRows = A.length;
  const aCols = A[0].length;
  const bCols = B[0].length;
  const C: number[][] = Array.from({ length: aRows }, () => new Array(bCols).fill(0));
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) sum += A[i][k] * B[k][j];
      C[i][j] = sum;
    }
  }
  return C;
}

function matVecMul(A: number[][], v: number[]): number[] {
  const rows = A.length;
  const cols = A[0].length;
  const result = new Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) sum += A[i][j] * v[j];
    result[i] = sum;
  }
  return result;
}

function matInverse(M: number[][]): number[][] | null {
  const n = M.length;
  const aug: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array(2 * n).fill(0);
    for (let j = 0; j < n; j++) row[j] = M[i][j];
    row[n + i] = 1;
    return row;
  });

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-12) return null;

    if (maxRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

function ols(y: number[], X: number[][]): { residuals: number[]; rss: number } {
  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const inv = matInverse(XtX);
  if (!inv) return { residuals: y.slice(), rss: y.reduce((s, v) => s + v * v, 0) };

  const XtY = matVecMul(Xt, y);
  const beta = matVecMul(inv, XtY);

  const residuals = new Array(y.length);
  let rss = 0;
  for (let i = 0; i < y.length; i++) {
    let pred = 0;
    for (let j = 0; j < beta.length; j++) pred += X[i][j] * beta[j];
    const r = y[i] - pred;
    residuals[i] = r;
    rss += r * r;
  }

  return { residuals, rss };
}

function buildLagMatrix(y: number[], x: number[], lag: number): {
  yTrim: number[];
  restricted: number[][];
  unrestricted: number[][];
} {
  const T = y.length - lag;
  const yTrim = new Array(T);
  const restricted: number[][] = new Array(T);
  const unrestricted: number[][] = new Array(T);

  for (let t = 0; t < T; t++) {
    yTrim[t] = y[t + lag];

    const rRow = new Array(lag + 1);
    const uRow = new Array(2 * lag + 1);

    for (let l = 0; l < lag; l++) {
      rRow[l] = y[t + lag - 1 - l];
      uRow[l] = y[t + lag - 1 - l];
      uRow[lag + l] = x[t + lag - 1 - l];
    }
    rRow[lag] = 1;
    uRow[2 * lag] = 1;

    restricted[t] = rRow;
    unrestricted[t] = uRow;
  }

  return { yTrim, restricted, unrestricted };
}

function fStat(rssR: number, rssU: number, lag: number, T: number): number {
  const df2 = T - 2 * lag - 1;
  if (df2 <= 0 || rssU <= 0) return 0;
  return ((rssR - rssU) / lag) / (rssU / df2);
}

function lgamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return front * cfBeta(a, b, x) / a;
  }
  return 1 - front * cfBeta(b, a, 1 - x) / b;
}

function cfBeta(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 1e-10;

  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;

    let an = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + an * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + an / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;

    an = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + an * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + an / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return h;
}

function fDistCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0;
  const x = (d1 * f) / (d1 * f + d2);
  return incompleteBeta(d1 / 2, d2 / 2, x);
}

function bicScore(rss: number, T: number, k: number): number {
  return T * Math.log(rss / T) + k * Math.log(T);
}

function selectLag(y: number[], x: number[], maxLag: number): number {
  let bestLag = 1;
  let bestBic = Infinity;

  for (let lag = 1; lag <= maxLag; lag++) {
    if (y.length - lag < MIN_SAMPLE) break;

    const { yTrim, unrestricted } = buildLagMatrix(y, x, lag);
    const { rss } = ols(yTrim, unrestricted);
    const k = 2 * lag + 1;
    const score = bicScore(rss, yTrim.length, k);

    if (score < bestBic) {
      bestBic = score;
      bestLag = lag;
    }
  }

  return bestLag;
}

export function grangerTest(y: number[], x: number[], maxLag: number = DEFAULT_MAX_LAG): GrangerResult | null {
  if (y.length < MIN_SAMPLE || x.length < MIN_SAMPLE) return null;
  const len = Math.min(y.length, x.length);
  const yS = y.slice(0, len);
  const xS = x.slice(0, len);

  const lag = selectLag(yS, xS, maxLag);
  const T = len - lag;
  if (T < MIN_SAMPLE) return null;

  const { yTrim, restricted, unrestricted } = buildLagMatrix(yS, xS, lag);
  const rR = ols(yTrim, restricted);
  const rU = ols(yTrim, unrestricted);

  const f = fStat(rR.rss, rU.rss, lag, T);
  const df2 = T - 2 * lag - 1;
  if (df2 <= 0) return null;

  const pValue = 1 - fDistCdf(f, lag, df2);
  const bic = bicScore(rU.rss, T, 2 * lag + 1);

  return { fStatistic: f, pValue, lag, sampleSize: T, bic };
}

export function firstDifference(series: number[]): number[] {
  const result = new Array(series.length - 1);
  for (let i = 0; i < result.length; i++) {
    result[i] = series[i + 1] - series[i];
  }
  return result;
}
