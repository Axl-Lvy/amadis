// Pure code-point offset remapping. When a passage's NFC text is edited, its
// placement spans must MOVE, not vanish. We model the edit as a single replaced
// region derived from the common prefix and suffix of the old and new text
// (code-point arrays). This is exact for any one contiguous edit, and safe for
// multi-region edits (everything between the first and last difference is treated
// as one changed region). Offsets are Unicode code points (see lib/offsets.ts).

export type Span = { id: string; start: number; end: number };
export type RemapResult = { updated: Span[]; dropped: string[] };

export function remapPlacements(
  oldText: string,
  newText: string,
  spans: Span[],
): RemapResult {
  if (oldText === newText) {
    return { updated: spans.map((s) => ({ ...s })), dropped: [] };
  }

  const a = Array.from(oldText);
  const b = Array.from(newText);

  // Common prefix length.
  let p = 0;
  const minLen = Math.min(a.length, b.length);
  while (p < minLen && a[p] === b[p]) p++;

  // Common suffix length (not overlapping the prefix).
  let s = 0;
  const maxSuf = minLen - p;
  while (s < maxSuf && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

  const oms = p; // old region start (== new region start)
  const ome = a.length - s; // old region end
  const nme = b.length - s; // new region end
  const delta = b.length - a.length;

  const mapStart = (q: number) => (q < oms ? q : q >= ome ? q + delta : oms);
  const mapEnd = (q: number) => (q >= ome ? q + delta : q <= oms ? q : nme);

  const updated: Span[] = [];
  const dropped: string[] = [];
  for (const span of spans) {
    const start = mapStart(span.start);
    const end = mapEnd(span.end);
    if (start >= end) dropped.push(span.id);
    else updated.push({ id: span.id, start, end });
  }
  return { updated, dropped };
}
