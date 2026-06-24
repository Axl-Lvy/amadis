// Annotation offsets are Unicode code-point indices into NFC-normalized text.
// `start` is inclusive, `end` is exclusive. The annotation UI renders one span
// per code point (indexed by code-point offset), so selection and highlighting
// both work in code-point space directly, never UTF-16 units or bytes.

// Number of Unicode code points in `text`.
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

// Slice `text` by code-point offsets (start inclusive, end exclusive).
export function sliceByCodePoint(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

// NFC-normalize once at the boundary so stored offsets stay stable.
export function toNFC(text: string): string {
  return text.normalize("NFC");
}
