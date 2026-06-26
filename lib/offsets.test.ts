import { describe, expect, it } from "vitest";

import { codePointLength, sliceByCodePoint, toNFC } from "./offsets";

describe("codePointLength", () => {
  it("counts ASCII as one per character", () => {
    expect(codePointLength("hello")).toBe(5);
  });

  it("counts an astral code point as one, not two UTF-16 units", () => {
    // "😀" is a single code point but String#length (UTF-16) reports 2.
    expect("😀").toHaveLength(2);
    expect(codePointLength("😀")).toBe(1);
  });

  it("counts a combining sequence as its code points, not graphemes", () => {
    // "e" + combining acute: two code points, one grapheme.
    expect(codePointLength("é")).toBe(2);
  });

  it("is zero for the empty string", () => {
    expect(codePointLength("")).toBe(0);
  });
});

describe("sliceByCodePoint", () => {
  it("slices in code-point space, start inclusive and end exclusive", () => {
    expect(sliceByCodePoint("abcdef", 1, 4)).toBe("bcd");
  });

  it("does not split an astral code point", () => {
    const text = "a😀b";
    // Code-point offsets: a=0, 😀=1, b=2. Slicing [1,2) yields the whole emoji.
    expect(sliceByCodePoint(text, 1, 2)).toBe("😀");
    expect(sliceByCodePoint(text, 2, 3)).toBe("b");
  });

  it("returns empty when start equals end", () => {
    expect(sliceByCodePoint("abc", 1, 1)).toBe("");
  });
});

describe("toNFC", () => {
  it("composes a decomposed sequence to a single code point", () => {
    const decomposed = "é"; // e + combining acute
    const composed = toNFC(decomposed);
    expect(composed).toBe("é"); // é
    expect(codePointLength(composed)).toBe(1);
  });

  it("leaves already-composed text unchanged", () => {
    expect(toNFC("café")).toBe("café");
  });
});
