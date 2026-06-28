"use client";

import { HelpCircle } from "lucide-react";

interface UrgencyInfoModalProps {
  onClose: () => void;
}

export function UrgencyInfoModal({ onClose }: UrgencyInfoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 rounded-lg border border-theme bg-panel shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-theme">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary-glass">
            <HelpCircle className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary leading-none">
              How distance works
            </h2>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-secondary">
            Everything on this map sits at a distance from the center based on how much it currently needs attention — not size, not alphabetical order.
          </p>
          <p className="text-sm text-secondary">
            What pulls something closer: requests that are actively being worked on count the most. Requests that are queued but not started yet count too, just less. The longer the oldest unaddressed request has been waiting also nudges it closer.
          </p>
          <p className="text-sm text-secondary">
            What doesn&rsquo;t: simply not being touched in a while, on its own. A quiet dashboard with nothing queued drifts to the outer ring, even if no one&rsquo;s looked at it lately — staleness only matters once there&rsquo;s actual work waiting.
          </p>
          <p className="text-sm text-secondary">
            A division takes the position of its most urgent item — one busy dashboard can pull its whole division inward, even if everything else in it is calm.
          </p>

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
