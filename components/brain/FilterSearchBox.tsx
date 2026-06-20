"use client";

// Search input + results dropdown for the FilterRail's typeahead
// (GALAXY_VIEW_SPEC.md section 8: "Search: typeahead for dashboards,
// divisions, stakeholders — selecting a result zooms straight to it").
// Split out of FilterRail.tsx purely to keep that file from growing too
// large; carries no state of its own beyond local dropdown-open tracking.

import { useState } from "react";
import { Search } from "lucide-react";
import { SearchResult } from "@/lib/brain-search";

interface FilterSearchBoxProps {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[];
  onSelectResult: (result: SearchResult) => void;
}

export function FilterSearchBox({
  query,
  onQueryChange,
  results,
  onSelectResult,
}: FilterSearchBoxProps) {
  const [focused, setFocused] = useState(false);

  const showDropdown = focused && query.trim().length > 0;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search dashboards, divisions…"
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-theme bg-panel text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-64 overflow-y-auto rounded-md border border-theme bg-panel shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-secondary">No matches.</p>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                // onMouseDown (not onClick) so the click registers before the
                // input's onBlur fires and collapses the dropdown out from
                // under the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectResult(result);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {result.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
