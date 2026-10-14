/** Spotlight geometry for the guided tour.
 *
 * Kept outside the component file so `GuidedTour.tsx` only exports
 * components (react-refresh rule) and the math stays directly testable.
 */

export type TourAnchor = string | readonly string[] | null;

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Viewport-relative rect of the anchor(s), or null when missing.
 *
 * Multiple anchors spotlight their bounding union. Zero-area rects
 * (jsdom, display:none ancestors) count as missing so the step falls
 * back to a centered dialog.
 */
export function measureTarget(anchor: TourAnchor): TargetRect | null {
  if (anchor === null) return null;
  const names = Array.isArray(anchor) ? anchor : [anchor];
  const rects: TargetRect[] = [];
  for (const name of names) {
    const element = document.querySelector(`[data-tour="${name}"]`);
    if (!(element instanceof HTMLElement) || !element.isConnected) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
