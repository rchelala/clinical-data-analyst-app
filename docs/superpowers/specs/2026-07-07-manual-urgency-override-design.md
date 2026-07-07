# Manual Urgency Override — Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm) — pending implementation plan

## Context

In the Dashboard Brain, **urgency** is a fully computed score. `computeUrgency()`
in [lib/urgency.ts](../../../lib/urgency.ts) blends staleness, open/in-progress
request counts, and oldest-open-request age; the result drives (a) the continuous
orbital **radius** and (b) the rank-based **high/med/low buckets**. It is recomputed
on every request in three API routes and, for the solar-system "Urgency mix", again
client-side. There is no stored urgency and no way to influence it by hand.

The user wants to **manually set urgency** — e.g. pin a dashboard to High because
they know it matters right now, regardless of what the formula says. This is the
one missing lever over an otherwise-automatic model.

## Goal

Let a user override a dashboard's or report subscription's urgency to a fixed
**level (High / Med / Low)** that wins over the computed formula, persists until
explicitly reset to **Auto**, and is reflected everywhere urgency is shown —
including the aggregate galaxy and solar-system displays.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Override model | **Level override** (High / Med / Low), not numeric/boost/pin-to-top |
| Scope | **Both** dashboards and report subscriptions |
| Persistence | **Until manually reset to Auto** (no auto-expiry) |
| Integration | **Approach A — override at the output**: compute normally, then overlay the override on the resolved bucket and radius |
| v1 node marker | **Deferred** — a DetailPanel badge covers "don't forget the pin" |

## Architecture

### Single rule, reused everywhere
A pure helper in [lib/urgency.ts](../../../lib/urgency.ts) is the sole definition
of the override rule, imported by both server routes and client components so pins
behave identically in every view:

```ts
export function resolveBucket(
  computed: UrgencyBucket,
  manual: UrgencyBucket | null
): UrgencyBucket {
  return manual ?? computed;
}

// Representative orbital radius for a pinned entity's level.
export const MANUAL_RADIUS: Record<UrgencyBucket, number> = {
  high: MIN_RADIUS,                          // pulled toward center
  med: (MIN_RADIUS + MAX_RADIUS) / 2,        // mid-band
  low: MAX_RADIUS,                           // outer edge
};
```

Overridden entities do not finely sort *among themselves* by computed score — that
is the intended meaning of a manual pin.

### Data model
- New nullable column `manual_urgency text` on **both** `dashboards` and
  `report_subscriptions`. Values `'high' | 'med' | 'low'`; `NULL` = Auto.
- Not enforced by a DB enum/check, matching the existing `status`/`priority`
  convention. Validation happens in the API layer.
- Migration: `scripts/migrations/010_manual_urgency.sql`, using
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` on both tables (mirrors prior
  delta migrations, run manually against Neon).

### Types & mapping
- Add `manualUrgency: UrgencyBucket | null` to the `Dashboard` and
  `ReportSubscription` interfaces in [lib/brain-types.ts](../../../lib/brain-types.ts)
  (inherited by `DashboardWithUrgency` / `ReportSubscriptionWithUrgency`, so it
  rides along on the objects the client already receives).
- Map `manual_urgency` ↔ `manualUrgency` in `brain-mappers`.
- Add `manual_urgency` to the three SELECTs: `dashboard-queries`
  (`fetchDashboardRowsWithStaleness`, `fetchSubscriptionRowsWithStaleness`) so both
  the per-analyst routes and the galaxy route receive it.

### Where the override is applied

1. **Edit modal** — [EditEntityForm.tsx](../../../components/brain/EditEntityForm.tsx)
   gets a "Manual urgency" `<select>` next to Status: **Auto** (default) / High /
   Med / Low. Threaded via a new `initialManualUrgency` prop and included in the
   PATCH body. Works for both kinds (the form already handles both).

2. **Write path** — the PATCH routes `/api/dashboards/[id]` and
   `/api/report-subscriptions/[id]` accept a `manualUrgency` field, validate it is
   one of `high | med | low | null`, and persist. `null` clears the override.

3. **Orbital radius** (server) — in the dashboards and report-subscriptions GET
   routes, after `normalizeRadius(...)`, snap any entity with `manualUrgency !== null`
   to `MANUAL_RADIUS[manualUrgency]`. Drives the PlanetView orbital distance.

4. **Galaxy analyst "High urgency" count** (server) — in
   [galaxy/route.ts](../../../app/api/brain/galaxy/route.ts), resolve each combined
   row's bucket with `resolveBucket(buckets[i], row.manual_urgency)` *before* the
   `=== 'high'` tally. A dashboard pinned High immediately raises its analyst's count.

5. **Solar-system "Urgency mix" + moon color/fade** (client) — in
   [SolarSystemView.tsx](../../../components/brain/SolarSystemView.tsx), after
   `bucketUrgencies(scores)`, overlay `resolveBucket(bucket, entity.manualUrgency)`
   in the `urgencyBucketsById` memo. This feeds both the hover-panel mix and the
   status/urgency fade, so pins move and recolor consistently. Buckets here remain
   **per-analyst terciles** (unchanged) — only the overlay is added.

6. **DetailPanel** — [DetailPanel.tsx](../../../components/brain/DetailPanel.tsx)
   shows an urgency row: a **"Manual · High"** badge when pinned, otherwise the
   computed bucket. Reset to Auto is done through the edit form's Auto option.

## Units & boundaries

- **`lib/urgency.ts`** stays the pure, dependency-free home of the urgency rules
  (`computeUrgency`, `normalizeRadius`, `bucketUrgencies`, plus new `resolveBucket`
  and `MANUAL_RADIUS`). No DB, no React — trivially unit-testable.
- **API routes** own persistence + validation and apply the overlay to their
  outputs. Server and client both call `resolveBucket`, so there is one rule.
- **Components** own presentation only (the select, the badge, the client overlay).

## Testing

- **Unit** (`lib/urgency`): `resolveBucket` returns the manual value when set and
  the computed value when `null`; `MANUAL_RADIUS` maps each level to the expected
  band (High→center, Low→outer).
- **Manual/E2E:**
  1. Pin a dashboard to High in the edit modal → its node moves inward, its
     DetailPanel shows "Manual · High", and the change survives a reload.
  2. That dashboard's analyst "High urgency" count in the galaxy increments, and
     its division's "Urgency mix" in the solar system reflects the pin.
  3. Reset to Auto → node returns to its computed orbit/bucket and the aggregate
     counts revert.
  4. Repeat for a report subscription.
  5. `tsc --noEmit` clean.

## Out of scope (v1)

- Node visual marker/ring for pinned entities (DetailPanel badge suffices).
- Auto-expiry or activity-based clearing of overrides.
- Numeric urgency entry or additive boosts.
- Bulk pin/unpin.
