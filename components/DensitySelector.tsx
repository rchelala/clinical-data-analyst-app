"use client";

import { Density } from "@/lib/prompts";

interface Props {
  value: Density;
  onChange: (density: Density) => void;
}

const options: { value: Density; label: string; description: string }[] = [
  { value: "brief",         label: "Brief",         description: "Key lines only" },
  { value: "detailed",      label: "Detailed",      description: "Every clause" },
  { value: "step-by-step",  label: "Step-by-step",  description: "Full walkthrough" },
];

export function DensitySelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-secondary uppercase tracking-wide">
        Depth
      </span>
      <div className="flex items-center gap-0.5 p-[3px] rounded-lg bg-panel border border-theme">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.description}
            aria-pressed={value === opt.value}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              value === opt.value
                ? "bg-secondary text-primary shadow-panel"
                : "text-secondary hover:text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
