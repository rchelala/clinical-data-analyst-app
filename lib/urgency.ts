// Pure functions for the orbital urgency model. No DB access here — callers
// fetch raw rows and pass derived numbers in.

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

/**
 * Min-max normalizes urgency scores into a radius band. Urgency is inverted
 * relative to radius: per the design doc, higher urgency pulls a dashboard
 * toward the center, so the most urgent score maps to minRadius and the
 * least urgent score maps to maxRadius.
 */
export function normalizeRadius(
  urgencyScores: number[],
  minRadius = 80,
  maxRadius = 400
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
