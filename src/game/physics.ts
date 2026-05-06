import RAPIER, { type RigidBody, type World } from "@dimforge/rapier3d-compat";
import { createCushionSegments, createEightBallRack, TABLE } from "./constants";
import {
  detectPocket,
  distanceSq,
  isOffTable,
  isValidCuePlacement,
  railContactsForBall,
  type BallSnapshot,
  type Vec2
} from "./geometry";
import type { PocketedBall, RailContact, ShotResult, StrokeVars } from "./types";

interface PhysicsBall {
  number: number;
  body: RigidBody;
  active: boolean;
  start: Vec2;
}

let rapierReady: Promise<void> | null = null;

export class BilliardsPhysics {
  private world: World;
  private balls = new Map<number, PhysicsBall>();
  private shotRecording: ShotRecorder | null = null;
  private stillFrames = 0;

  static async create(): Promise<BilliardsPhysics> {
    rapierReady ??= (RAPIER.init as unknown as (options?: object) => Promise<void>)({});
    await rapierReady;
    return new BilliardsPhysics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = TABLE.fixedStep;
    this.world.numSolverIterations = 8;
    this.world.numAdditionalFrictionIterations = 8;
    this.createCushions();
    this.reset();
  }

  dispose(): void {
    this.world.free();
  }

  reset(): void {
    for (const ball of this.balls.values()) {
      ball.body.setEnabled(false);
    }
    this.balls.clear();
    for (const ball of createEightBallRack()) {
      this.balls.set(ball.number, {
        number: ball.number,
        body: this.createBallBody(ball.x, ball.z, ball.number),
        active: true,
        start: { x: ball.x, z: ball.z }
      });
    }
    this.shotRecording = null;
    this.stillFrames = 0;
  }

  getBallSnapshots(): BallSnapshot[] {
    return [...this.balls.values()].map((ball) => {
      const t = ball.body.translation();
      return {
        number: ball.number,
        active: ball.active,
        x: t.x,
        z: t.z
      };
    });
  }

  getCueBall(): BallSnapshot {
    const cue = this.balls.get(0);
    if (!cue) throw new Error("Cue ball is missing.");
    const t = cue.body.translation();
    return { number: 0, active: cue.active, x: t.x, z: t.z };
  }

  isCuePlacementValid(point: Vec2): boolean {
    return isValidCuePlacement(point, this.getBallSnapshots());
  }

  placeCueBall(point: Vec2): boolean {
    if (!this.isCuePlacementValid(point)) return false;
    this.respotBall(0, point);
    return true;
  }

  shoot(stroke: StrokeVars): void {
    const cue = this.balls.get(0);
    if (!cue || !cue.active) return;
    const direction = { x: Math.cos(stroke.aimAngle), z: Math.sin(stroke.aimAngle) };
    const speed = 2.2 + stroke.power * 6.2;
    const side = stroke.spinX * 0.22;
    cue.body.setLinvel(
      {
        x: direction.x * speed - direction.z * side,
        y: 0,
        z: direction.z * speed + direction.x * side
      },
      true
    );
    cue.body.setAngvel({ x: -direction.z * speed * 10, y: stroke.spinX * 8, z: direction.x * speed * 10 }, true);
    cue.body.wakeUp();
    this.shotRecording = new ShotRecorder();
    this.stillFrames = 0;
  }

  step(): ShotResult | null {
    this.world.step();
    this.constrainBallsToTablePlane();
    this.recordShotEvents();

    if (!this.shotRecording) return null;
    if (this.isMoving()) {
      this.stillFrames = 0;
      return null;
    }

    this.stillFrames += 1;
    if (this.stillFrames < 24) return null;

    const result = this.shotRecording.toResult();
    this.shotRecording = null;
    return result;
  }

  isMoving(): boolean {
    for (const ball of this.balls.values()) {
      if (!ball.active) continue;
      const v = ball.body.linvel();
      if (Math.hypot(v.x, v.z) > TABLE.stopSpeed) return true;
    }
    return false;
  }

  respotBall(number: number, point?: Vec2): void {
    const ball = this.balls.get(number);
    if (!ball) return;
    const target = point ?? ball.start;
    ball.active = true;
    ball.body.setEnabled(true);
    ball.body.setTranslation({ x: target.x, y: TABLE.ballY, z: target.z }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.wakeUp();
  }

  removeBall(number: number): void {
    const ball = this.balls.get(number);
    if (!ball) return;
    ball.active = false;
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    ball.body.setEnabled(false);
  }

  private createBallBody(x: number, z: number, number: number): RigidBody {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, TABLE.ballY, z)
      .enabledTranslations(true, false, true)
      .setLinearDamping(0.72)
      .setAngularDamping(0.9)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4)
      .setUserData({ kind: "ball", number });
    const body = this.world.createRigidBody(desc);
    const collider = RAPIER.ColliderDesc.ball(TABLE.ballRadius)
      .setRestitution(0.94)
      .setFriction(0.18)
      .setDensity(1.25);
    this.world.createCollider(collider, body);
    return body;
  }

  private createCushions(): void {
    for (const segment of createCushionSegments()) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(segment.x, TABLE.ballY, segment.z)
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(segment.halfX, TABLE.cushionHeight, segment.halfZ)
          .setRestitution(0.88)
          .setFriction(0.1),
        body
      );
    }
  }

  private constrainBallsToTablePlane(): void {
    for (const ball of this.balls.values()) {
      if (!ball.active) continue;
      const t = ball.body.translation();
      const v = ball.body.linvel();
      if (Math.abs(t.y - TABLE.ballY) > 1e-4 || Math.abs(v.y) > 1e-4) {
        ball.body.setTranslation({ x: t.x, y: TABLE.ballY, z: t.z }, false);
        ball.body.setLinvel({ x: v.x, y: 0, z: v.z }, false);
      }
    }
  }

  private recordShotEvents(): void {
    const recorder = this.shotRecording;
    if (!recorder) return;
    const snapshots = this.getBallSnapshots();
    const cue = snapshots.find((ball) => ball.number === 0);

    if (cue && cue.active && recorder.firstContactBall === null) {
      for (const ball of snapshots) {
        if (!ball.active || ball.number === 0) continue;
        const contactRange = (TABLE.ballRadius * 2.05) ** 2;
        if (distanceSq(cue, ball) <= contactRange) {
          const cueBody = this.balls.get(0)?.body;
          const ballBody = this.balls.get(ball.number)?.body;
          const cv = cueBody?.linvel();
          const bv = ballBody?.linvel();
          const relSpeed = Math.hypot((cv?.x ?? 0) - (bv?.x ?? 0), (cv?.z ?? 0) - (bv?.z ?? 0));
          if (relSpeed > 0.02) {
            recorder.firstContactBall = ball.number;
            break;
          }
        }
      }
    }

    for (const snapshot of snapshots) {
      for (const contact of railContactsForBall(snapshot)) recorder.addRail(contact);

      const pocket = detectPocket(snapshot);
      if (pocket && snapshot.active) {
        recorder.addPocket(snapshot.number, pocket);
        if (snapshot.number === 0) recorder.cueBallPocketed = true;
        this.removeBall(snapshot.number);
        continue;
      }

      if (snapshot.active && isOffTable(snapshot)) {
        recorder.addOffTable(snapshot.number);
        if (snapshot.number === 0) recorder.cueBallPocketed = true;
        this.removeBall(snapshot.number);
      }
    }
  }
}

class ShotRecorder {
  firstContactBall: number | null = null;
  cueBallPocketed = false;
  private pocketed = new Map<number, PocketedBall>();
  private offTable = new Set<number>();
  private rails = new Map<string, RailContact>();

  addPocket(ball: number, pocket: PocketedBall["pocket"]): void {
    if (!this.pocketed.has(ball)) this.pocketed.set(ball, { ball, pocket });
  }

  addOffTable(ball: number): void {
    this.offTable.add(ball);
  }

  addRail(contact: RailContact): void {
    this.rails.set(`${contact.ball}:${contact.rail}`, contact);
  }

  toResult(): ShotResult {
    const railContacts = [...this.rails.values()];
    const objectBallsToRail = new Set(railContacts.filter((contact) => contact.ball > 0).map((contact) => contact.ball));
    return {
      firstContactBall: this.firstContactBall,
      pocketedBalls: [...this.pocketed.values()],
      railContacts,
      offTableBalls: [...this.offTable],
      cueBallPocketed: this.cueBallPocketed,
      breakStats: {
        objectBallsToRail: objectBallsToRail.size
      }
    };
  }
}
