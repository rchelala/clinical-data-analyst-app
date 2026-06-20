"use client";

// Persistent left-side filter rail, visible across all three zoom levels
// (GALAXY_VIEW_SPEC.md section 8). Pure controlled-component: owns no
// filter state itself, just renders `filters` and reports toggles via
// `onFiltersChange`. Styled consistently with the existing bg-panel/
// border-theme convention used by RequestSidePanel.tsx and the legend/
// detail panels rather than inventing new patterns.

import { Analyst, DashboardStatus, RequestStatus, UrgencyBucket } from "@/lib/brain-types";
import { BrainFilters } from "@/lib/filters";
import { SearchResult } from "@/lib/brain-search";
import { FilterSearchBox } from "@/components/brain/FilterSearchBox";

interface FilterRailProps {
  filters: BrainFilters;
  onFiltersChange: (next: BrainFilters) => void;
  analysts: Analyst[];
  showAnalystFocus: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchResults: SearchResult[];
  onSelectSearchResult: (result: SearchResult) => void;
}

const URGENCY_OPTIONS: { value: UrgencyBucket; label: string }[] = [
  { value: "high", label: "High" },
  { value: "med", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS: { value: DashboardStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

const REQUEST_STATE_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Closed" },
];

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

interface FilterCheckboxGroupProps<T extends string> {
  title: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (value: T) => void;
}

function FilterCheckboxGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: FilterCheckboxGroupProps<T>) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-xs text-primary cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => onToggle(option.value)}
              className="w-3.5 h-3.5 accent-brand-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function FilterRail({
  filters,
  onFiltersChange,
  analysts,
  showAnalystFocus,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onSelectSearchResult,
}: FilterRailProps) {
  const handleToggleUrgency = (value: UrgencyBucket) => {
    onFiltersChange({ ...filters, urgency: toggleInSet(filters.urgency, value) });
  };

  const handleToggleStatus = (value: DashboardStatus) => {
    onFiltersChange({ ...filters, status: toggleInSet(filters.status, value) });
  };

  const handleToggleRequestState = (value: RequestStatus) => {
    onFiltersChange({ ...filters, requestState: toggleInSet(filters.requestState, value) });
  };

  // Solo/compare picker: clicking an unselected analyst adds them (capped at
  // 2 — if a 3rd is clicked while 2 are already selected, the oldest
  // selection is dropped to make room for the new one, so the picker always
  // reflects the most recently clicked pair rather than silently ignoring
  // the click). Clicking an already-selected analyst removes them.
  const handleToggleAnalystFocus = (analystId: number) => {
    const current = filters.analystFocus;
    let next: number[];
    if (current.includes(analystId)) {
      next = current.filter((id) => id !== analystId);
    } else if (current.length >= 2) {
      next = [current[1], analystId];
    } else {
      next = [...current, analystId];
    }
    onFiltersChange({ ...filters, analystFocus: next });
  };

  return (
    <aside className="w-56 flex-shrink-0 h-full overflow-y-auto border-r border-theme bg-secondary-glass px-3 py-4 flex flex-col gap-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
          Search
        </p>
        <FilterSearchBox
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          results={searchResults}
          onSelectResult={onSelectSearchResult}
        />
      </div>

      <FilterCheckboxGroup
        title="Urgency"
        options={URGENCY_OPTIONS}
        selected={filters.urgency}
        onToggle={handleToggleUrgency}
      />

      <FilterCheckboxGroup
        title="Status"
        options={STATUS_OPTIONS}
        selected={filters.status}
        onToggle={handleToggleStatus}
      />

      <FilterCheckboxGroup
        title="Request state"
        options={REQUEST_STATE_OPTIONS}
        selected={filters.requestState}
        onToggle={handleToggleRequestState}
      />

      {showAnalystFocus && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary mb-1.5">
            Analyst focus
          </p>
          <p className="text-[11px] text-secondary mb-2">
            Pick up to 2 to solo/compare. Others fade.
          </p>
          <div className="flex flex-col gap-1">
            {analysts.map((analyst) => (
              <label
                key={analyst.id}
                className="flex items-center gap-2 text-xs text-primary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={filters.analystFocus.includes(analyst.id)}
                  onChange={() => handleToggleAnalystFocus(analyst.id)}
                  className="w-3.5 h-3.5 accent-brand-500"
                />
                {analyst.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
