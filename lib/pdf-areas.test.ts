import { describe, expect, it } from "vitest";

import { areaBounds, columnTranslate, focus } from "./pdf-areas";

// Two pages, each 1000px tall, stacked at 0 and 1000; content height 2000.
const tops = [0, 1000];
const heights = [1000, 1000];

describe("areaBounds", () => {
  it("returns [0, contentHeight] with no marks (one area)", () => {
    expect(areaBounds(tops, heights, [], 2000)).toEqual([0, 2000]);
  });

  it("inserts sorted mark offsets between 0 and contentHeight", () => {
    const marks = [
      { page: 2, frac: 0.5 }, // 1000 + 500 = 1500
      { page: 1, frac: 0.25 }, // 250
    ];
    expect(areaBounds(tops, heights, marks, 2000)).toEqual([0, 250, 1500, 2000]);
  });
});

describe("focus", () => {
  const bounds = [0, 1000, 2000]; // 2 areas, viewport 400 tall
  const V = 400;

  it("centers area 0 when its boundaries are off-screen", () => {
    // center at 500 -> well inside area 0, marks (0 and 1000) > V/2 away
    expect(focus(300, V, bounds)).toBeCloseTo(0, 5); // center = 500
  });

  it("interpolates toward area 1 as the boundary enters from the bottom", () => {
    // center Y at 900 -> bottom mark 1000 is 100 below center (< V/2=200)
    // pBot = (200-100)/200 = 0.5 -> phi = 0 + 0.5*0.5 = 0.25
    expect(focus(700, V, bounds)).toBeCloseTo(0.25, 5);
  });

  it("reaches halfway when the boundary sits at the viewport center", () => {
    // center Y = 1000 exactly: it's area 1 (bounds[1]<=Y), dTop=0 -> pTop=1 -> phi=1-0.5=0.5
    expect(focus(800, V, bounds)).toBeCloseTo(0.5, 5);
  });

  it("clamps to the last area at the bottom", () => {
    expect(focus(1600, V, bounds)).toBeCloseTo(1, 5); // center 1800, area 1, bottom mark 2000 (200 away)=>pBot 0
  });
});

describe("columnTranslate", () => {
  it("centers box 0 at phi=0", () => {
    // boxH 600, gap 24, viewport 400 -> 0*(624)+300-200 = 100
    expect(columnTranslate(0, 600, 24, 400)).toBe(100);
  });
  it("is linear between box centers", () => {
    // phi=1 -> 1*624 + 300 - 200 = 724
    expect(columnTranslate(1, 600, 24, 400)).toBe(724);
    // phi=0.5 -> 0.5*624 + 100 = 412
    expect(columnTranslate(0.5, 600, 24, 400)).toBe(412);
  });
});
