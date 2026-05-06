import type { PocketId } from "./types";

export const TABLE = {
  length: 4.6,
  width: 2.3,
  railThickness: 0.18,
  cushionHeight: 0.16,
  ballRadius: 0.055,
  ballY: 0.075,
  pocketRadius: 0.17,
  pocketMouthGap: 0.28,
  offTablePadding: 0.42,
  fixedStep: 1 / 120,
  stopSpeed: 0.035
} as const;

export const HALF_LENGTH = TABLE.length / 2;
export const HALF_WIDTH = TABLE.width / 2;

export interface PocketDef {
  id: PocketId;
  x: number;
  z: number;
}

export const POCKETS: PocketDef[] = [
  { id: "tl", x: -HALF_LENGTH, z: HALF_WIDTH },
  { id: "tc", x: 0, z: HALF_WIDTH + 0.015 },
  { id: "tr", x: HALF_LENGTH, z: HALF_WIDTH },
  { id: "bl", x: -HALF_LENGTH, z: -HALF_WIDTH },
  { id: "bc", x: 0, z: -HALF_WIDTH - 0.015 },
  { id: "br", x: HALF_LENGTH, z: -HALF_WIDTH }
];

export const BALL_COLORS: Record<number, string> = {
  0: "#f2ead5",
  1: "#f4c430",
  2: "#2453d6",
  3: "#d92028",
  4: "#5b2ca0",
  5: "#f26d21",
  6: "#147a4b",
  7: "#7b1d1d",
  8: "#111111",
  9: "#f4c430",
  10: "#2453d6",
  11: "#d92028",
  12: "#5b2ca0",
  13: "#f26d21",
  14: "#147a4b",
  15: "#7b1d1d"
};

export interface BallStart {
  number: number;
  x: number;
  z: number;
}

export function createEightBallRack(): BallStart[] {
  const balls: BallStart[] = [{ number: 0, x: -1.45, z: 0 }];
  const rowNumbers = [
    [1],
    [9, 2],
    [10, 8, 3],
    [4, 11, 12, 5],
    [13, 6, 14, 7, 15]
  ];
  const spacingX = TABLE.ballRadius * 1.82;
  const spacingZ = TABLE.ballRadius * 2.08;
  const apexX = 0.82;

  for (let row = 0; row < rowNumbers.length; row += 1) {
    const numbers = rowNumbers[row];
    for (let col = 0; col < numbers.length; col += 1) {
      balls.push({
        number: numbers[col],
        x: apexX + row * spacingX,
        z: (col - row / 2) * spacingZ
      });
    }
  }
  return balls;
}

export interface CushionSegment {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

export function createCushionSegments(): CushionSegment[] {
  const t = TABLE.railThickness;
  const cornerGap = TABLE.pocketMouthGap;
  const middleGap = TABLE.pocketMouthGap * 0.82;
  const sideZ = HALF_WIDTH + t / 2;
  const endX = HALF_LENGTH + t / 2;

  const topBottom: CushionSegment[] = [];
  for (const z of [sideZ, -sideZ]) {
    const leftStart = -HALF_LENGTH + cornerGap;
    const leftEnd = -middleGap;
    const rightStart = middleGap;
    const rightEnd = HALF_LENGTH - cornerGap;
    topBottom.push({
      x: (leftStart + leftEnd) / 2,
      z,
      halfX: (leftEnd - leftStart) / 2,
      halfZ: t / 2
    });
    topBottom.push({
      x: (rightStart + rightEnd) / 2,
      z,
      halfX: (rightEnd - rightStart) / 2,
      halfZ: t / 2
    });
  }

  const leftRight: CushionSegment[] = [];
  for (const x of [endX, -endX]) {
    const start = -HALF_WIDTH + cornerGap;
    const end = HALF_WIDTH - cornerGap;
    leftRight.push({
      x,
      z: (start + end) / 2,
      halfX: t / 2,
      halfZ: (end - start) / 2
    });
  }

  return [...topBottom, ...leftRight];
}
