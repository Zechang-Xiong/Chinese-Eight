import { describe, expect, it } from "vitest";
import { TABLE } from "./constants";
import {
  computePrediction,
  detectPocket,
  isOffTable,
  isValidCuePlacement,
  railContactsForBall,
  type BallSnapshot
} from "./geometry";

describe("table geometry helpers", () => {
  it("rejects cue-ball placement outside the table and on top of another ball", () => {
    const balls: BallSnapshot[] = [
      { number: 0, active: true, x: -1, z: 0 },
      { number: 1, active: true, x: 0, z: 0 }
    ];

    expect(isValidCuePlacement({ x: 0, z: 0 }, balls)).toBe(false);
    expect(isValidCuePlacement({ x: 99, z: 0 }, balls)).toBe(false);
    expect(isValidCuePlacement({ x: -1.1, z: 0.4 }, balls)).toBe(true);
  });

  it("predicts the first object ball on a straight shot", () => {
    const balls: BallSnapshot[] = [
      { number: 0, active: true, x: 0, z: 0 },
      { number: 4, active: true, x: 0.8, z: 0 },
      { number: 12, active: true, x: 1.2, z: 0.18 }
    ];

    const prediction = computePrediction(balls[0], 0, balls);

    expect(prediction.firstTarget).toBe(4);
    expect(prediction.cuePath[1].x).toBeLessThan(0.8);
    expect(prediction.objectPath.length).toBe(2);
  });

  it("detects pocket, rail contact, and off-table states", () => {
    expect(detectPocket({ x: -2.3, z: 1.15 })).toBe("tl");
    expect(isOffTable({ x: 3.1, z: 0 })).toBe(true);
    expect(
      railContactsForBall({
        number: 2,
        active: true,
        x: -2.3 + TABLE.ballRadius,
        z: 0
      })
    ).toEqual([{ ball: 2, rail: "left" }]);
  });
});
