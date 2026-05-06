import { describe, expect, it } from "vitest";
import { ControlsController } from "./controls";

describe("ControlsController", () => {
  it("moves the observation point with keyboard-style forward and strafe input", () => {
    const controls = new ControlsController();
    const start = { ...controls.viewOffset };

    const moved = controls.moveView(1, 0, 0.5);

    expect(moved).toBe(true);
    expect(Math.hypot(controls.viewOffset.x - start.x, controls.viewOffset.z - start.z)).toBeGreaterThan(0.01);
  });

  it("does not pan the camera while aiming", () => {
    const controls = new ControlsController();
    controls.enterAim(0);

    const moved = controls.moveView(1, 1, 0.5);

    expect(moved).toBe(false);
    expect(controls.viewOffset).toEqual({ x: 0, z: 0 });
  });

  it("keeps the aim camera fixed when nudging the shot direction", () => {
    const controls = new ControlsController();
    controls.enterAim(0.25);

    controls.addAimDelta(20);

    expect(controls.stroke.aimAngle).not.toBe(0.25);
    expect(controls.aimCameraAngle).toBe(0.25);
  });

  it("keeps observation movement within the playable view bounds", () => {
    const controls = new ControlsController();

    for (let index = 0; index < 500; index += 1) {
      controls.moveView(1, 1, 0.5);
    }

    expect(Math.abs(controls.viewOffset.x)).toBeLessThan(2.1);
    expect(Math.abs(controls.viewOffset.z)).toBeLessThan(1);
  });
});
