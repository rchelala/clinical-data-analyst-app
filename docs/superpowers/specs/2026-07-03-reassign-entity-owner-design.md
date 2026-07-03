# Reassign Dashboard / Subscription Owner — Design

**Date:** 2026-07-03
**Status:** Approved

## Problem

A dashboard's (and report subscription's) owning analyst is stored in the
`analyst_id` foreign key. That value is only ever set at creation time
(`POST /api/dashboards`, `POST /api/report-subscriptions`). No API endpoint or
UI can change it afterward, so an entity cannot be reassigned from one analyst
to another. The `PATCH` handlers deliberately omit `analyst_id` from their
`SET` clause today (they read it back in `RETURNING` unchanged).

## Goal

Let a user reassign an existing dashboard or subscription to a different analyst
(or unassign it), from the galaxy's existing per-entity **Edit** modal.

## Scope

- **Both** dashboards and subscriptions (both have an `analyst_id` owner).
- **Owner only.** Reassigning the entity does **not** move its tasks. Existing
  tasks keep their own `owner_analyst_id`.
- No database migration — `analyst_id` columns and FKs already exist.

## Placement decision

Reassigning owner is an *edit* of an existing entity, so it belongs in the
existing `EditEntityForm` modal (reached by clicking a node in the galaxy →
Edit in the side panel), not the "Add Dashboard / Subscription" create menu.
The Edit modal already reassigns the entity's **division**; owner reassignment
sits naturally alongside it.

## Design

### 1. API — `PATCH /api/dashboards/[id]` and `PATCH /api/report-subscriptions/[id]`

- Accept an optional `analystId?: number | null` in the request body.
  - `undefined` → not provided → unchanged (existing merge behavior).
  - `null` → explicitly unassign.
  - number → reassign to that analyst.
- Add `analyst_id` to:
  - the merge object (`analystId !== undefined ? analystId : current[0].analyst_id`),
  - the `UPDATE ... SET` clause,
  - the "at least one field must be provided" guard,
  - the `RETURNING` list (already present).
- `last_touched_date` stays untouched — a reassignment is not "this entity was
  worked on," matching the existing rationale comment in the handler.
- The existing `23503` foreign-key-violation catch already returns a clean 400
  for a bad reference; extend its message to mention an invalid analyst id.

Apply the same change symmetrically to the report-subscriptions PATCH handler.

### 2. `EditEntityForm` component

- New prop: `initialAnalystId: number | null`.
- On mount, fetch `/api/analysts` (same pattern `AnalystSelector` uses) into
  local state.
- Render an **"Analyst (owner)"** `<select>` below the Division field, styled
  identically to the existing selects:
  - First option: `— Unassigned —` with value `""`.
  - One option per analyst (`id` → `name`).
  - Pre-selected to `initialAnalystId` (empty when null).
- Include `analystId` in the PATCH body: `""` → `null`, otherwise `Number(value)`.
- Only send `analystId` on a real edit (`selectedKind === kind`), not during a
  type conversion — matching how the form already gates division/link changes
  during conversion. (Conversion posts to the `/convert` endpoint, which is out
  of scope here.)

### 3. Wiring — `RequestSidePanel`

- Pass `initialAnalystId={entity.analystId ?? null}` into `EditEntityForm`.
- The existing `onSaved` → `onEntityUpdated` path already refreshes the galaxy,
  so the reassigned entity moves into the new owner's galaxy (and out of the
  previous owner's) immediately.

## Data model (already exists)

- `dashboards.analyst_id` — nullable FK → `analysts(id)`.
- `report_subscriptions.analyst_id` — FK → `analysts(id)`.
- `Dashboard` / `Subscription` TS types already carry `analystId`, and
  `mapDashboardRow` / the subscription mapper already map it.

## Testing (manual verification)

1. Reassign a dashboard from analyst A to analyst B → it appears in B's galaxy
   and disappears from A's.
2. Reassign a subscription the same way.
3. Unassign a dashboard (`— Unassigned —`) → persists as null.
4. A dashboard's tasks keep their original owner after reassignment.
5. Type conversion flow still works and does not send `analystId`.
6. A bad `analystId` returns HTTP 400 with a clear message.

## Out of scope

- Cascading task reassignment.
- Reassigning owner from the Add/create menu.
- Bulk reassignment.
