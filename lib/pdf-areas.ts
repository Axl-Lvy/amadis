// Pure geometry for the PDF "areas" view. The PDF scrolls in a content space of
// pixel offsets; marks cut it into areas. The right-hand passage column is a
// stack of fixed-height boxes whose scroll is a smooth function of the PDF
// scroll: the focused area's box is centered, transitioning to a neighbor as a
// boundary mark crosses the viewport. All math is pure and unit-tested; the
// component only wires scroll events to these functions.

export type MarkPoint = { page: number; frac: number };

// Boundary pixel offsets in PDF content space: [0, …sorted mark offsets…, contentHeight].
export function areaBounds(
  pageTops: number[],
  pageHeights: number[],
  marks: MarkPoint[],
  contentHeight: number,
): number[] {
  const sorted = [...marks].sort((m, n) => m.page - n.page || m.frac - n.frac);
  const offsets = sorted.map((m) => pageTops[m.page - 1] + m.frac * pageHeights[m.page - 1]);
  return [0, ...offsets, contentHeight];
}

// Continuous focus value phi in [0, numAreas-1]. Away from marks, phi == area
// index (box centered). As a boundary nears the viewport center it interpolates
// linearly toward the neighbor; a tiny area centered yields phi == its index.
export function focus(scrollTop: number, viewportH: number, bounds: number[]): number {
  const numAreas = bounds.length - 1;
  const half = viewportH / 2;
  const y = scrollTop + half;

  let i = 0;
  while (i < numAreas - 1 && y >= bounds[i + 1]) i++;

  const dTop = y - bounds[i];
  const dBot = bounds[i + 1] - y;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const pTop = clamp01((half - dTop) / half);
  const pBot = clamp01((half - dBot) / half);

  const phi = i - 0.5 * pTop + 0.5 * pBot;
  return Math.max(0, Math.min(numAreas - 1, phi));
}

// Right-column scroll offset that centers box `phi` (linear between box centers).
export function columnTranslate(
  phi: number,
  boxH: number,
  gap: number,
  viewportH: number,
): number {
  return phi * (boxH + gap) + boxH / 2 - viewportH / 2;
}
