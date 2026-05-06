import { describe, expect, it } from "vitest";
import { BilliardsPhysics } from "./physics";

describe("BilliardsPhysics", () => {
  it("produces repeatable positions with a fixed timestep", async () => {
    const first = await BilliardsPhysics.create();
    const second = await BilliardsPhysics.create();

    const stroke = { aimAngle: 0, power: 0.2, spinX: 0, spinY: 0, elevation: 0.08 };
    first.shoot(stroke);
    second.shoot(stroke);

    for (let i = 0; i < 40; i += 1) {
      first.step();
      second.step();
    }

    const a = first.getBallSnapshots().sort((x, y) => x.number - y.number);
    const b = second.getBallSnapshots().sort((x, y) => x.number - y.number);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i].active).toBe(b[i].active);
      expect(a[i].x).toBeCloseTo(b[i].x, 2);
      expect(a[i].z).toBeCloseTo(b[i].z, 2);
    }

    first.dispose();
    second.dispose();
  });
});
