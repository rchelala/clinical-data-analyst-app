// Pure functions for the orbital urgency model. No DB access here — callers
// fetch raw rows and pass derived numbers in.

import { UrgencyBucket } from '@/lib/brain-types';

/**
 * urgency = (days_stale * 1.0) + (open_requests * 7) + (oldest_open_request_age * 0.5)
 */
export function computeUrgency(
  daysStale: number,
  openRequestCount: number,
  oldestOpenRequestAgeDays: number
): number {
  return daysStale * 1.0 + openRequestCount * 7 + oldestOpenRequestAgeDays * 0.5;
}

export const MIN_RADIUS = 80;
export const MAX_RADIUS = 400;

/**
 * Min-max normalizes urgency scores into a radius band. Urgency is inverted
 * relative to radius: per the design doc, higher urgency pulls a dashboard
 * toward the center, so the most urgent score maps to minRadius and the
 * least urgent score maps to maxRadius.
 */
export function normalizeRadius(
  urgencyScores: number[],
  minRadius = MIN_RADIUS,
  maxRadius = MAX_RADIUS
): number[] {
  const min = Math.min(...urgencyScores);
  const max = Math.max(...urgencyScores);

  // All scores equal means min-max would divide by zero; place everything
  // at the midpoint of the band instead.
  if (max === min) {
    const midpoint = (minRadius + maxRadius) / 2;
    return urgencyScores.map(() => midpoint);
  }

  return urgencyScores.map((score) => {
    const t = (score - min) / (max - min);
    // Invert t so higher urgency (t closer to 1) yields a smaller radius.
    return maxRadius - t * (maxRadius - minRadius);
  });
}

/**
 * Buckets urgency scores into rank-based terciles: the highest third of
 * scores -> 'high', the middle third -> 'med', the lowest third -> 'low'.
 * Returns a parallel array (same order/length as the input), like
 * normalizeRadius above.
 *
 * Cutoffs are computed from a sorted copy of the scores (rank-based), not
 * from a fixed numeric range, since urgency has no fixed bounds.
 */
export function bucketUrgencies(scores: number[]): UrgencyBucket[] {
  if (scores.length === 0) return [];

  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // All scores equal means there's no meaningful tercile split; put
  // everything in the middle bucket, mirroring normalizeRadius's
  // all-equal-scores handling.
  if (max === min) {
    return scores.map(() => 'med');
  }

  // Rank-based tercile cutoffs: the values at the 1/3 and 2/3 boundaries of
  // the sorted list.
  const lowerIndex = Math.floor(sorted.length / 3);
  const upperIndex = Math.floor((sorted.length * 2) / 3);
  const lowerCutoff = sorted[lowerIndex];
  const upperCutoff = sorted[upperIndex];

  return scores.map((score) => {
    if (score >= upperCutoff) return 'high';
    if (score >= lowerCutoff) return 'med';
    return 'low';
  });
}
