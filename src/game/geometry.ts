import { HALF_LENGTH, HALF_WIDTH, POCKETS, TABLE } from "./constants";
import type { PocketId, RailContact } from "./types";

export interface Vec2 {
  x: number;
  z: number;
}

export interface BallSnapshot extends Vec2 {
  number: number;
  active: boolean;
}

export interface PredictionRoute {
  cuePath: Vec2[];
  objectPath: Vec2[];
  firstTarget: number | null;
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function normalize2(vec: Vec2): Vec2 {
  const len = Math.hypot(vec.x, vec.z);
  if (len < 1e-6) return { x: 1, z: 0 };
  return { x: vec.x / len, z: vec.z / len };
}

export function directionFromAngle(angle: number): Vec2 {
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export function isInsidePlayableArea(point: Vec2, margin: number = TABLE.ballRadius): boolean {
  return (
    point.x >= -HALF_LENGTH + margin &&
    point.x <= HALF_LENGTH - margin &&
    point.z >= -HALF_WIDTH + margin &&
    point.z <= HALF_WIDTH - margin
  );
}

export function isOffTable(point: Vec2): boolean {
  return (
    Math.abs(point.x) > HALF_LENGTH + TABLE.offTablePadding ||
    Math.abs(point.z) > HALF_WIDTH + TABLE.offTablePadding
  );
}

export function detectPocket(point: Vec2): PocketId | null {
  const limit = TABLE.pocketRadius * TABLE.pocketRadius;
  let closest: PocketId | null = null;
  let closestDist = Number.POSITIVE_INFINITY;
  for (const pocket of POCKETS) {
    const d = distanceSq(point, pocket);
    if (d < limit && d < closestDist) {
      closest = pocket.id;
      closestDist = d;
    }
  }
  return closest;
}

export function isValidCuePlacement(point: Vec2, balls: BallSnapshot[]): boolean {
  if (!isInsidePlayableArea(point, TABLE.ballRadius * 1.15)) return false;
  const minDistSq = (TABLE.ballRadius * 2.08) ** 2;
  return balls.every((ball) => !ball.active || ball.number === 0 || distanceSq(point, ball) >= minDistSq);
}

export function railContactsForBall(ball: BallSnapshot): RailContact[] {
  if (!ball.active || ball.number === 0) return [];
  const contacts: RailContact[] = [];
  const margin = TABLE.ballRadius * 1.35;
  if (ball.x <= -HALF_LENGTH + margin) contacts.push({ ball: ball.number, rail: "left" });
  if (ball.x >= HALF_LENGTH - margin) contacts.push({ ball: ball.number, rail: "right" });
  if (ball.z <= -HALF_WIDTH + margin) contacts.push({ ball: ball.number, rail: "bottom" });
  if (ball.z >= HALF_WIDTH - margin) contacts.push({ ball: ball.number, rail: "top" });
  return contacts;
}

export function computePrediction(
  cue: Vec2,
  aimAngle: number,
  balls: BallSnapshot[],
  maxDistance = 2.25
): PredictionRoute {
  const dir = directionFromAngle(aimAngle);
  const collisionRadius = TABLE.ballRadius * 2;
  let bestDistance = maxDistance;
  let firstTarget: BallSnapshot | null = null;
  let hitPoint = {
    x: cue.x + dir.x * maxDistance,
    z: cue.z + dir.z * maxDistance
  };

  const wallDistance = distanceToTableEdge(cue, dir);
  if (wallDistance < bestDistance) {
    bestDistance = wallDistance;
    hitPoint = { x: cue.x + dir.x * bestDistance, z: cue.z + dir.z * bestDistance };
  }

  for (const ball of balls) {
    if (!ball.active || ball.number === 0) continue;
    const toBall = { x: ball.x - cue.x, z: ball.z - cue.z };
    const projection = toBall.x * dir.x + toBall.z * dir.z;
    if (projection <= 0) continue;

    const perpendicularSq = toBall.x * toBall.x + toBall.z * toBall.z - projection * projection;
    if (perpendicularSq > collisionRadius * collisionRadius) continue;

    const offset = Math.sqrt(collisionRadius * collisionRadius - perpendicularSq);
    const impactDistance = projection - offset;
    if (impactDistance > 0 && impactDistance < bestDistance) {
      bestDistance = impactDistance;
      firstTarget = ball;
      hitPoint = { x: cue.x + dir.x * bestDistance, z: cue.z + dir.z * bestDistance };
    }
  }

  const cuePath = [cue, hitPoint];
  const objectPath: Vec2[] = [];
  if (firstTarget) {
    const objectDir = normalize2({
      x: firstTarget.x - hitPoint.x,
      z: firstTarget.z - hitPoint.z
    });
    const endDistance = Math.min(distanceToTableEdge(firstTarget, objectDir), 1.45);
    objectPath.push(firstTarget, {
      x: firstTarget.x + objectDir.x * endDistance,
      z: firstTarget.z + objectDir.z * endDistance
    });
  }

  return {
    cuePath,
    objectPath,
    firstTarget: firstTarget?.number ?? null
  };
}

function distanceToTableEdge(origin: Vec2, dir: Vec2): number {
  const distances: number[] = [];
  if (Math.abs(dir.x) > 1e-5) {
    distances.push(((dir.x > 0 ? HALF_LENGTH : -HALF_LENGTH) - origin.x) / dir.x);
  }
  if (Math.abs(dir.z) > 1e-5) {
    distances.push(((dir.z > 0 ? HALF_WIDTH : -HALF_WIDTH) - origin.z) / dir.z);
  }
  return Math.max(0, Math.min(...distances.filter((distance) => distance > 0), 5));
}
