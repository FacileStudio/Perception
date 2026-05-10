export type BocpdState = {
  mu0: number;
  kappa0: number;
  alpha0: number;
  beta0: number;
  muParams: number[];
  kappaParams: number[];
  alphaParams: number[];
  betaParams: number[];
  logRunLengthDist: number[];
  t: number;
};

const HAZARD_LAMBDA = 100;
const LOG_PRUNE_THRESHOLD = Math.log(0.001);
const MAX_RUN_LENGTHS = 200;

function logSumExp(logValues: number[]): number {
  if (logValues.length === 0) return -Infinity;
  const maxVal = Math.max(...logValues);
  if (maxVal === -Infinity) return -Infinity;
  let sum = 0;
  for (const v of logValues) sum += Math.exp(v - maxVal);
  return maxVal + Math.log(sum);
}

function studentTLogPdf(x: number, mu: number, kappa: number, alpha: number, beta: number): number {
  const nu = 2 * alpha;
  const sigma2 = beta * (kappa + 1) / (alpha * kappa);
  const t = (x - mu) / Math.sqrt(sigma2);
  const logCoeff =
    lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * sigma2);
  const logBody = -((nu + 1) / 2) * Math.log(1 + (t * t) / nu);
  return logCoeff + logBody;
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

export function initBocpd(priorMean = 0, priorVariance = 1): BocpdState {
  return {
    mu0: priorMean,
    kappa0: 1,
    alpha0: 1,
    beta0: priorVariance,
    muParams: [priorMean],
    kappaParams: [1],
    alphaParams: [1],
    betaParams: [priorVariance],
    logRunLengthDist: [0],
    t: 0,
  };
}

export type BocpdResult = {
  changePointProbability: number;
  maxRunLength: number;
  preMean: number;
  postMean: number;
};

export function updateBocpd(state: BocpdState, observation: number): BocpdResult {
  const n = state.logRunLengthDist.length;
  const logH = -Math.log(HAZARD_LAMBDA);
  const log1mH = Math.log(1 - 1 / HAZARD_LAMBDA);

  const logPredProbs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    logPredProbs[i] = studentTLogPdf(
      observation,
      state.muParams[i],
      state.kappaParams[i],
      state.alphaParams[i],
      state.betaParams[i],
    );
  }

  const logGrowthProbs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    logGrowthProbs[i] = state.logRunLengthDist[i] + logPredProbs[i] + log1mH;
  }

  const logCpProbs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    logCpProbs[i] = state.logRunLengthDist[i] + logPredProbs[i] + logH;
  }
  const logCpProb = logSumExp(logCpProbs);

  const newLogDist = [logCpProb, ...logGrowthProbs];

  const logEvidence = logSumExp(newLogDist);
  for (let i = 0; i < newLogDist.length; i++) {
    newLogDist[i] -= logEvidence;
  }

  const newMu = new Array<number>(n + 1);
  const newKappa = new Array<number>(n + 1);
  const newAlpha = new Array<number>(n + 1);
  const newBeta = new Array<number>(n + 1);

  newMu[0] = state.mu0;
  newKappa[0] = state.kappa0;
  newAlpha[0] = state.alpha0;
  newBeta[0] = state.beta0;

  for (let i = 0; i < n; i++) {
    const k = state.kappaParams[i];
    const mu = state.muParams[i];
    const a = state.alphaParams[i];
    const b = state.betaParams[i];

    newMu[i + 1] = (k * mu + observation) / (k + 1);
    newKappa[i + 1] = k + 1;
    newAlpha[i + 1] = a + 0.5;
    newBeta[i + 1] = b + (k * (observation - mu) ** 2) / (2 * (k + 1));
  }

  let prunedLogDist = newLogDist;
  let prunedMu = newMu;
  let prunedKappa = newKappa;
  let prunedAlpha = newAlpha;
  let prunedBeta = newBeta;

  if (prunedLogDist.length > MAX_RUN_LENGTHS) {
    const indices: number[] = [];
    for (let i = 0; i < prunedLogDist.length; i++) {
      if (prunedLogDist[i] > LOG_PRUNE_THRESHOLD || i === 0) indices.push(i);
    }
    if (indices.length < prunedLogDist.length) {
      prunedLogDist = indices.map((i) => prunedLogDist[i]);
      prunedMu = indices.map((i) => prunedMu[i]);
      prunedKappa = indices.map((i) => prunedKappa[i]);
      prunedAlpha = indices.map((i) => prunedAlpha[i]);
      prunedBeta = indices.map((i) => prunedBeta[i]);

      const norm = logSumExp(prunedLogDist);
      for (let i = 0; i < prunedLogDist.length; i++) prunedLogDist[i] -= norm;
    }
  }

  const changePointProbability = Math.exp(newLogDist[0]);

  let maxIdx = 0;
  let maxVal = prunedLogDist[0];
  for (let i = 1; i < prunedLogDist.length; i++) {
    if (prunedLogDist[i] > maxVal) { maxVal = prunedLogDist[i]; maxIdx = i; }
  }

  const postMean = prunedMu[maxIdx];
  const longestRunIdx = prunedLogDist.length - 1;
  const preMean = prunedMu[longestRunIdx] ?? state.mu0;

  state.logRunLengthDist = prunedLogDist;
  state.muParams = prunedMu;
  state.kappaParams = prunedKappa;
  state.alphaParams = prunedAlpha;
  state.betaParams = prunedBeta;
  state.t++;

  return {
    changePointProbability,
    maxRunLength: maxIdx,
    preMean,
    postMean,
  };
}
