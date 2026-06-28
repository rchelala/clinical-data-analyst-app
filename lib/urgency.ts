// Pure functions for the orbital urgency model. No DB access here — callers
// fetch raw rows and pass derived numbers in.

import { UrgencyBucket } from '@/lib/brain-types';

const STALE_WEIGHT = 1.0;
const OPEN_WEIGHT = 5;
const IN_PROGRESS_WEIGHT = 9;
const OLDEST_OPEN_WEIGHT = 0.5;

/**
 * urgency = (has_open_work ? days_stale * 1.0 : 0)
 *   + (open_only_requests * 5) + (in_progress_requests * 9)
 *   + (oldest_open_request_age * 0.5)
 *
 * In-progress work pulls a dashboard closer than merely-queued (open) work,
 * and staleness only contributes once there's actual pending work — a
 * dashboard with zero open/in_progress requests gets no urgency boost from
 * staleness alone.
 */
export function computeUrgency(
  daysStale: number,
  openRequestCount: number, // total non-done (open + in_progress) requests
  inProgressRequestCount: number,
  oldestOpenRequestAgeDays: number
): number {
  const openOnlyCount = openRequestCount - inProgressRequestCount;
  const hasOpenWork = openRequestCount > 0;
  return (
    (hasOpenWork ? daysStale * STALE_WEIGHT : 0) +
    openOnlyCount * OPEN_WEIGHT +
    inProgressRequestCount * IN_PROGRESS_WEIGHT +
    oldestOpenRequestAgeDays * OLDEST_OPEN_WEIGHT
  );
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
