// Module-level cache for small, rarely-changing reference lists
// (analysts/divisions/tags) that many independent components on the Brain
// and Worklist pages each fetch on mount. Without this, opening the Brain
// page alone fires /api/analysts from half a dozen sibling components, and
// RequestSidePanel re-fetches /api/analysts + /api/tags every time a
// different entity is selected even though neither list depends on which
// entity is selected.
//
// Deliberately NOT used for analyst-/entity-scoped lists (e.g. dashboards
// filtered by x-analyst-id, or a division's own tasks) — those change often
// and per-caller, so they're left as plain fetches at their call sites.
//
// No new dependency — this is a hand-rolled in-flight-promise + resolved-
// value cache, not SWR/TanStack Query.

import { Analyst, Division, Tag } from "@/lib/brain-types";

type ReferenceKind = "analysts" | "divisions" | "tags";

interface CacheEntry<T> {
  // Non-null while a fetch for this kind is in flight, so concurrent callers
  // share the same request instead of each firing their own.
  promise: Promise<T> | null;
  // The resolved value, once a fetch has succeeded. Serves every subsequent
  // caller until invalidated.
  value: T | null;
}

function makeEntry<T>(): CacheEntry<T> {
  return { promise: null, value: null };
}

const caches: {
  analysts: CacheEntry<Analyst[]>;
  divisions: CacheEntry<Division[]>;
  tags: CacheEntry<Tag[]>;
} = {
  analysts: makeEntry(),
  divisions: makeEntry(),
  tags: makeEntry(),
};

async function fetchList<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Could not load ${url}.`);
  }
  return data as T;
}

function getOrFetch<T>(kind: ReferenceKind, url: string): Promise<T> {
  const cache = caches[kind] as unknown as CacheEntry<T>;

  if (cache.value !== null) return Promise.resolve(cache.value);
  if (cache.promise) return cache.promise;

  const promise = fetchList<T>(url)
    .then((data) => {
      cache.value = data;
      cache.promise = null;
      return data;
    })
    .catch((err) => {
      // A rejected fetch is never cached — the next caller (or a retry by
      // the same caller) gets a fresh attempt instead of a permanently
      // failed cache entry.
      cache.promise = null;
      throw err;
    });

  cache.promise = promise;
  return promise;
}

export function fetchAnalysts(): Promise<Analyst[]> {
  return getOrFetch<Analyst[]>("analysts", "/api/analysts");
}

export function fetchDivisions(): Promise<Division[]> {
  return getOrFetch<Division[]>("divisions", "/api/divisions");
}

export function fetchTags(): Promise<Tag[]> {
  return getOrFetch<Tag[]>("tags", "/api/tags");
}

// Call after a mutation that changes one of these lists (create/rename/
// delete an analyst, division, or tag) so the next call to the matching
// fetchXxx() above re-fetches instead of serving stale data. Omit `kind` to
// clear every cached list.
export function invalidateReferenceData(kind?: ReferenceKind): void {
  if (kind) {
    caches[kind].value = null;
    caches[kind].promise = null;
    return;
  }
  (Object.keys(caches) as ReferenceKind[]).forEach((k) => {
    caches[k].value = null;
    caches[k].promise = null;
  });
}
