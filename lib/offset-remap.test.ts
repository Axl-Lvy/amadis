import { describe, expect, it } from "vitest";

import { remapPlacements, type Span } from "./offset-remap";

const span = (start: number, end: number): Span => ({ id: `${start}-${end}`, start, end });
function one(oldText: string, newText: string, s: Span) {
  const r = remapPlacements(oldText, newText, [s]);
  return r.dropped.length ? null : { start: r.updated[0].start, end: r.updated[0].end };
}

describe("remapPlacements", () => {
  it("is identity when text is unchanged", () => {
    const spans = [span(1, 3), span(4, 9)];
    const r = remapPlacements("hello world", "hello world", spans);
    expect(r.dropped).toEqual([]);
    expect(r.updated).toEqual(spans);
  });

  it("leaves a span untouched when the edit is entirely after it", () => {
    // "abcde" -> "abcdeXYZ"; span over "ab"
    expect(one("abcde", "abcdeXYZ", span(0, 2))).toEqual({ start: 0, end: 2 });
  });

  it("shifts a span when text is inserted entirely before it", () => {
    // insert "XYZ" (3) at offset 0; span [0,2) of old "abcde" -> content now at [3,5)
    expect(one("abcde", "XYZabcde", span(0, 2))).toEqual({ start: 3, end: 5 });
  });

  it("extends the end when text is inserted strictly inside the span", () => {
    // "abcde" -> "abXYcde": insert "XY" (2) at offset 2; span [1,4) ("bcd")
    expect(one("abcde", "abXYcde", span(1, 4))).toEqual({ start: 1, end: 6 });
  });

  it("excludes text inserted exactly at the left edge", () => {
    // insert "XY" at offset 2; span starts at 2
    expect(one("abcde", "abXYcde", span(2, 4))).toEqual({ start: 4, end: 6 });
  });

  it("includes text inserted exactly at the right edge", () => {
    // insert "XY" at offset 3; span ends at 3
    expect(one("abcde", "abcXYde", span(1, 3))).toEqual({ start: 1, end: 5 });
  });

  it("shrinks a span when text inside it is deleted", () => {
    // "abcdef" -> "abf": delete "cde" (offsets 2..5); span [1,6) ("bcdef")
    expect(one("abcdef", "abf", span(1, 6))).toEqual({ start: 1, end: 3 });
  });

  it("shifts a span left when text before it is deleted", () => {
    // "abcdef" -> "aef": delete "bcd" (1..4); span [4,6) ("ef")
    expect(one("abcdef", "aef", span(4, 6))).toEqual({ start: 1, end: 3 });
  });

  it("drops a span whose text is entirely deleted", () => {
    // "abcdef" -> "af": delete "bcde" (1..5); span [1,5)
    const r = remapPlacements("abcdef", "af", [span(1, 5)]);
    expect(r.dropped).toEqual(["1-5"]);
    expect(r.updated).toEqual([]);
  });

  it("keeps and resizes a span whose text is fully replaced (not dropped)", () => {
    // "abcdef" -> "abXYZf": replace "cde" (2..5) with "XYZ"; span [2,5)
    expect(one("abcdef", "abXYZf", span(2, 5))).toEqual({ start: 2, end: 5 });
    // replace with longer "XYZW": span extends
    expect(one("abcdef", "abXYZWf", span(2, 5))).toEqual({ start: 2, end: 6 });
  });

  it("works in code-point space, not UTF-16 units", () => {
    // 🙂 is 2 UTF-16 units but 1 code point. Old "🙂ab", insert "Z" before "ab".
    // code points: [🙂,a,b] -> [🙂,Z,a,b]; span over "ab" = [1,3) -> [2,4)
    expect(one("🙂ab", "🙂Zab", span(1, 3))).toEqual({ start: 2, end: 4 });
  });

  it("handles multiple spans in one pass, dropping only collapsed ones", () => {
    // "abcdef" -> "aXf": delete "bcde" replaced by "X"; spans: [0,1)keep, [2,4)inside->[1,2), [1,5)
    const r = remapPlacements("abcdef", "aXf", [span(0, 1), span(2, 4), span(5, 6)]);
    const byId = Object.fromEntries(r.updated.map((s) => [s.id, s]));
    expect(byId["0-1"]).toMatchObject({ start: 0, end: 1 });
    expect(byId["2-4"]).toMatchObject({ start: 1, end: 2 }); // collapsed to the replacement
    expect(byId["5-6"]).toMatchObject({ start: 2, end: 3 }); // "f" shifted
    expect(r.dropped).toEqual([]);
  });
});
