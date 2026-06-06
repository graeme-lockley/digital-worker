import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  deserializeVector,
  serializeVector,
} from "./embeddings.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = Float32Array.from([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = Float32Array.from([1, 0]);
    const b = Float32Array.from([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns 0 for mismatched dimensions", () => {
    const a = Float32Array.from([1, 0, 0]);
    const b = Float32Array.from([1, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when a vector is all zeros", () => {
    const a = Float32Array.from([0, 0, 0]);
    const b = Float32Array.from([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe("vector serialization", () => {
  it("round-trips a Float32Array through bytes", () => {
    const original = Float32Array.from([0.1, -0.5, 3.25, 42]);
    const restored = deserializeVector(serializeVector(original));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });
});
