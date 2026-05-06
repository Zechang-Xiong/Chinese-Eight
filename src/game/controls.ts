import type { ControlMode, StrokeVars } from "./types";
import { HALF_LENGTH, HALF_WIDTH } from "./constants";

const VIEW_MARGIN = 0.26;

export class ControlsController {
  mode: ControlMode = "stand";
  stroke: StrokeVars = {
    aimAngle: 0,
    power: 0.42,
    spinX: 0,
    spinY: 0,
    elevation: 0.08
  };
  orbitAngle = -Math.PI * 0.78;
  aimCameraAngle = 0;
  viewOffset = { x: 0, z: 0 };
  crouch = false;

  enterAim(cueAngle: number): void {
    this.mode = "aim";
    this.stroke.aimAngle = cueAngle;
    this.aimCameraAngle = cueAngle;
  }

  stand(): void {
    this.mode = "stand";
    this.crouch = false;
  }

  toggleCrouch(): void {
    this.crouch = !this.crouch;
    this.mode = this.crouch ? "crouch" : "stand";
  }

  placeBall(): void {
    this.mode = "placeBall";
  }

  shotAnimating(): void {
    this.mode = "shotAnimating";
  }

  readyAfterShot(): void {
    this.mode = this.crouch ? "crouch" : "stand";
  }

  setPowerFromWheel(deltaY: number): void {
    this.setPower(this.stroke.power - deltaY * 0.0007);
  }

  setPower(value: number): void {
    this.stroke.power = clamp(value, 0.06, 1);
  }

  setElevationFromWheel(deltaY: number): void {
    this.setElevation(this.stroke.elevation - deltaY * 0.00045);
  }

  setElevation(value: number): void {
    this.stroke.elevation = clamp(value, 0, 0.52);
  }

  addAimDelta(deltaX: number): void {
    this.stroke.aimAngle += deltaX * 0.0045;
  }

  addOrbitDelta(deltaX: number): void {
    this.orbitAngle += deltaX * 0.004;
  }

  moveView(forward: number, strafe: number, dt: number): boolean {
    if (this.mode !== "stand" && this.mode !== "crouch") return false;
    if (Math.abs(forward) + Math.abs(strafe) < 0.01) return false;

    const forwardVector = {
      x: -Math.cos(this.orbitAngle),
      z: -Math.sin(this.orbitAngle)
    };
    const rightVector = {
      x: Math.sin(this.orbitAngle),
      z: -Math.cos(this.orbitAngle)
    };
    const speed = (this.mode === "crouch" ? 0.82 : 1.15) * Math.min(dt, 0.05);
    this.viewOffset.x = clamp(
      this.viewOffset.x + (forwardVector.x * forward + rightVector.x * strafe) * speed,
      -HALF_LENGTH + VIEW_MARGIN,
      HALF_LENGTH - VIEW_MARGIN
    );
    this.viewOffset.z = clamp(
      this.viewOffset.z + (forwardVector.z * forward + rightVector.z * strafe) * speed,
      -HALF_WIDTH + VIEW_MARGIN,
      HALF_WIDTH - VIEW_MARGIN
    );
    return true;
  }

  addSpinDelta(deltaX: number, deltaY: number): void {
    this.setSpin(this.stroke.spinX + deltaX * 0.006, this.stroke.spinY - deltaY * 0.006);
  }

  setSpin(spinX: number, spinY: number): void {
    const length = Math.hypot(spinX, spinY);
    const scale = length > 1 ? 1 / length : 1;
    this.stroke.spinX = clamp(spinX * scale, -1, 1);
    this.stroke.spinY = clamp(spinY * scale, -1, 1);
  }

  clearSpin(): void {
    this.stroke.spinX = 0;
    this.stroke.spinY = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
