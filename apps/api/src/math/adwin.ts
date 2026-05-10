const MAX_BUCKETS_PER_LEVEL = 5;
const DEFAULT_DELTA = 0.01;

type Bucket = { total: number; variance: number; count: number };

export class Adwin {
  private bucketLevels: Bucket[][] = [];
  private width = 0;
  private total = 0;
  private delta: number;

  constructor(delta = DEFAULT_DELTA) {
    this.delta = delta;
  }

  update(value: number): boolean {
    this.insertBucket(value);
    this.width++;
    this.total += value;

    return this.checkDrift();
  }

  private insertBucket(value: number): void {
    if (this.bucketLevels.length === 0) this.bucketLevels.push([]);
    this.bucketLevels[0].push({ total: value, variance: 0, count: 1 });
    this.compress();
  }

  private compress(): void {
    for (let level = 0; level < this.bucketLevels.length; level++) {
      if (this.bucketLevels[level].length <= MAX_BUCKETS_PER_LEVEL + 1) break;

      const b1 = this.bucketLevels[level].shift()!;
      const b2 = this.bucketLevels[level].shift()!;

      const mergedCount = b1.count + b2.count;
      const mergedTotal = b1.total + b2.total;
      const mean1 = b1.total / b1.count;
      const mean2 = b2.total / b2.count;
      const mergedVariance =
        b1.variance + b2.variance +
        (b1.count * b2.count * (mean1 - mean2) ** 2) / mergedCount;

      if (level + 1 >= this.bucketLevels.length) this.bucketLevels.push([]);
      this.bucketLevels[level + 1].push({
        total: mergedTotal,
        variance: mergedVariance,
        count: mergedCount,
      });
    }
  }

  private checkDrift(): boolean {
    if (this.width < 10) return false;

    let n1 = 0;
    let sum1 = 0;
    let var1 = 0;

    for (let level = this.bucketLevels.length - 1; level >= 0; level--) {
      for (let i = 0; i < this.bucketLevels[level].length; i++) {
        const bucket = this.bucketLevels[level][i];
        n1 += bucket.count;
        sum1 += bucket.total;
        var1 += bucket.variance;

        const n2 = this.width - n1;
        if (n1 < 5 || n2 < 5) continue;

        const mean1 = sum1 / n1;
        const mean2 = (this.total - sum1) / n2;
        const absDiff = Math.abs(mean1 - mean2);
        const epsilonCut = this.computeEpsilon(n1, n2);

        if (absDiff >= epsilonCut) {
          this.removeBucketsUpTo(level, i);
          return true;
        }
      }
    }
    return false;
  }

  private computeEpsilon(n1: number, n2: number): number {
    const n = n1 + n2;
    const m = 1 / n1 + 1 / n2;
    const deltaP = this.delta / Math.log(n);
    const epsilon = Math.sqrt((m / 2) * Math.log(4 / deltaP));
    return epsilon;
  }

  private removeBucketsUpTo(level: number, bucketIdx: number): void {
    let removed = 0;
    for (let l = this.bucketLevels.length - 1; l > level; l--) {
      for (const b of this.bucketLevels[l]) {
        removed += b.count;
        this.total -= b.total;
      }
      this.bucketLevels[l] = [];
    }
    for (let i = 0; i <= bucketIdx; i++) {
      const b = this.bucketLevels[level][i];
      removed += b.count;
      this.total -= b.total;
    }
    this.bucketLevels[level] = this.bucketLevels[level].slice(bucketIdx + 1);
    this.width -= removed;
  }

  getMean(): number {
    return this.width > 0 ? this.total / this.width : 0;
  }

  getWidth(): number {
    return this.width;
  }

  getState(): { width: number; mean: number; bucketLevels: number } {
    return { width: this.width, mean: this.getMean(), bucketLevels: this.bucketLevels.length };
  }
}

export type DriftResult = {
  drifted: boolean;
  driftScore: number;
  oldMean: number;
  newMean: number;
};

export function detectCategoricalDrift(
  oldDistribution: Record<string, number>,
  newDistribution: Record<string, number>,
  minSamples = 30,
): DriftResult {
  const oldTotal = Object.values(oldDistribution).reduce((a, b) => a + b, 0);
  const newTotal = Object.values(newDistribution).reduce((a, b) => a + b, 0);

  if (oldTotal < minSamples || newTotal < minSamples) {
    return { drifted: false, driftScore: 0, oldMean: 0, newMean: 0 };
  }

  const allKeys = new Set([...Object.keys(oldDistribution), ...Object.keys(newDistribution)]);
  let jsDivergence = 0;

  for (const key of allKeys) {
    const p = (oldDistribution[key] ?? 0) / oldTotal;
    const q = (newDistribution[key] ?? 0) / newTotal;
    const m = (p + q) / 2;

    if (p > 0 && m > 0) jsDivergence += 0.5 * p * Math.log2(p / m);
    if (q > 0 && m > 0) jsDivergence += 0.5 * q * Math.log2(q / m);
  }

  const driftScore = Math.sqrt(jsDivergence);
  const drifted = driftScore > 0.2;

  return { drifted, driftScore, oldMean: oldTotal, newMean: newTotal };
}
