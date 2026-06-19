"use client";

import { ZoomState } from "@/hooks/useBrainData";

interface BreadcrumbProps {
  zoom: ZoomState;
  analystName: string | null;
  divisionName: string | null;
  onNavigate: (zoom: ZoomState) => void;
}

// "Galaxy › {analyst name} › {division name}" trail. Non-final segments are
// clickable to jump zoom levels directly; the final/current segment is not.
export function Breadcrumb({ zoom, analystName, divisionName, onNavigate }: BreadcrumbProps) {
  const isGalaxy = zoom.level === "galaxy";
  const isAnalyst = zoom.level === "analyst";

  return (
    <nav className="flex items-center gap-1.5 text-xs text-secondary">
      {isGalaxy ? (
        <span className="text-primary font-medium">Galaxy</span>
      ) : (
        <button
          onClick={() => onNavigate({ level: "galaxy" })}
          className="hover:text-primary hover:underline transition-colors"
        >
          Galaxy
        </button>
      )}

      {zoom.level !== "galaxy" && (
        <>
          <span>›</span>
          {isAnalyst ? (
            <span className="text-primary font-medium">{analystName ?? "…"}</span>
          ) : (
            <button
              onClick={() => onNavigate({ level: "analyst", analystId: zoom.analystId })}
              className="hover:text-primary hover:underline transition-colors"
            >
              {analystName ?? "…"}
            </button>
          )}
        </>
      )}

      {zoom.level === "division" && (
        <>
          <span>›</span>
          <span className="text-primary font-medium">{divisionName ?? "…"}</span>
        </>
      )}
    </nav>
  );
}
