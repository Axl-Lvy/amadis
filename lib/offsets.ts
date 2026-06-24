// Annotation offsets are Unicode code-point indices into NFC-normalized text.
// `start` is inclusive, `end` is exclusive. These helpers keep client and server
// in agreement: the browser's Selection API works in UTF-16 code units, so any
// index coming from the DOM must be converted to a code-point offset first.

// Number of Unicode code points in `text`.
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

// Convert a UTF-16 code-unit index (e.g. from a DOM Range) into a code-point offset.
export function utf16IndexToCodePoint(text: string, utf16Index: number): number {
  let codePoints = 0;
  for (let i = 0; i < utf16Index && i < text.length; ) {
    const cp = text.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    codePoints += 1;
  }
  return codePoints;
}

// Slice `text` by code-point offsets (start inclusive, end exclusive).
export function sliceByCodePoint(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

// NFC-normalize once at the boundary so stored offsets stay stable.
export function toNFC(text: string): string {
  return text.normalize("NFC");
}
