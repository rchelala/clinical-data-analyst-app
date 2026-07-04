"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Returns a ref to attach to a container and a uniform scale (≤ 1) that makes a
 * `designSize`-square coordinate system fit inside that container. Scale is 1
 * whenever the container is at least `designSize` in both axes — so desktop,
 * where the container is large, always renders at scale 1 (unchanged).
 */
export function useFitScale(designSize: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(1, width / designSize, height / designSize);
      setScale(s > 0 ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designSize]);

  return { ref, scale };
}
