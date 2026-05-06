# Solo Clearance Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Chinese Eight Ball demo into a productized single-player solo clearance app with menu screens, settings, rules, current-session stats, and a realistic-feel game flow.

**Architecture:** Keep `src/game` as the tested billiards core, then add small modules for settings, routing, solo-clearance session state, HUD view models, and product screens. Integrate those modules into the existing DOM/Babylon app incrementally instead of replacing the whole game at once.

**Tech Stack:** Vite, TypeScript, Vitest, Babylon.js, Rapier, lucide icons, DOM APIs.

---

## File Structure

- Create `src/app/settings.ts`: settings types, defaults, validation, and localStorage persistence.
- Create `src/app/settings.test.ts`: settings defaults, normalization, and persistence tests.
- Create `src/app/router.ts`: product screen route model and tiny router.
- Create `src/app/router.test.ts`: route transition tests.
- Create `src/modes/solo-clearance/session.ts`: solo clearance phase, target group, current-session stats, foul handling, and shot settlement.
- Create `src/modes/solo-clearance/session.test.ts`: solo clearance state-machine tests.
- Create `src/ui/hudModel.ts`: pure mapping from solo session, settings, and control state to HUD labels.
- Create `src/ui/hudModel.test.ts`: HUD model tests.
- Create `src/ui/productScreens.ts`: HTML rendering helpers for homepage, mode selection, settings, rules, stats, and pause menu.
- Create `src/ui/productScreens.test.ts`: product screen rendering tests.
- Modify `src/game/scene.ts`: make aim prediction and landing hint visibility configurable.
- Create `src/rendering/assistOptions.ts`: pure assist option normalization for rendering.
- Create `src/rendering/assistOptions.test.ts`: assist normalization tests.
- Modify `src/ui/EightBallApp.ts`: wire settings, solo session, product shell navigation, current stats, and assist options into the existing game.
- Modify `src/styles/app.css`: product shell screens and redesigned HUD layout.
- Modify `src/main.ts`: continue booting the app from the same root.

## Task 1: Settings Store

**Files:**
- Create: `src/app/settings.ts`
- Create: `src/app/settings.test.ts`

- [ ] **Step 1: Write failing tests for default settings, normalization, and storage**

Create `src/app/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createSettingsStore,
  normalizeSettings,
  type AppSettings
} from "./settings";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("settings", () => {
  it("uses realistic-feel defaults with minimal assists", () => {
    expect(DEFAULT_SETTINGS.assists.aimGuide).toBe(true);
    expect(DEFAULT_SETTINGS.assists.predictionLine).toBe(false);
    expect(DEFAULT_SETTINGS.assists.landingHint).toBe(false);
    expect(DEFAULT_SETTINGS.assists.foulHints).toBe(true);
    expect(DEFAULT_SETTINGS.feel.powerCurve).toBe("realistic");
    expect(DEFAULT_SETTINGS.camera.defaultStance).toBe("stand");
  });

  it("normalizes invalid persisted values back into safe ranges", () => {
    const normalized = normalizeSettings({
      assists: { predictionLine: true },
      feel: {
        powerCurve: "arcade",
        spinSensitivity: 9,
        elevationSensitivity: -2
      },
      camera: {
        orbitSensitivity: 0,
        aimSensitivity: 3,
        defaultStance: "floor",
        lowView: true
      }
    });

    expect(normalized.assists.predictionLine).toBe(true);
    expect(normalized.assists.aimGuide).toBe(true);
    expect(normalized.feel.powerCurve).toBe("realistic");
    expect(normalized.feel.spinSensitivity).toBe(1.5);
    expect(normalized.feel.elevationSensitivity).toBe(0.5);
    expect(normalized.camera.orbitSensitivity).toBe(0.5);
    expect(normalized.camera.aimSensitivity).toBe(1.5);
    expect(normalized.camera.defaultStance).toBe("stand");
    expect(normalized.camera.lowView).toBe(true);
  });

  it("persists settings without saving rack state", () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(storage);
    const next: AppSettings = {
      ...store.get(),
      assists: { ...store.get().assists, predictionLine: true },
      camera: { ...store.get().camera, defaultStance: "low" }
    };

    store.set(next);

    const restored = createSettingsStore(storage).get();
    expect(restored.assists.predictionLine).toBe(true);
    expect(restored.camera.defaultStance).toBe("low");
    expect(storage.getItem("chinese-eight-ball:settings")).not.toContain("balls");
  });
});
```

- [ ] **Step 2: Run the failing settings tests**

Run:

```bash
npm test -- src/app/settings.test.ts
```

Expected: fail because `src/app/settings.ts` does not exist.

- [ ] **Step 3: Implement `src/app/settings.ts`**

Create `src/app/settings.ts`:

```ts
export type PowerCurve = "realistic" | "stable";
export type DefaultStance = "stand" | "low" | "aim";

export interface AssistSettings {
  aimGuide: boolean;
  predictionLine: boolean;
  landingHint: boolean;
  foulHints: boolean;
}

export interface FeelSettings {
  powerCurve: PowerCurve;
  spinSensitivity: number;
  elevationSensitivity: number;
}

export interface CameraSettings {
  orbitSensitivity: number;
  aimSensitivity: number;
  defaultStance: DefaultStance;
  lowView: boolean;
}

export interface AppSettings {
  assists: AssistSettings;
  feel: FeelSettings;
  camera: CameraSettings;
}

const STORAGE_KEY = "chinese-eight-ball:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  assists: {
    aimGuide: true,
    predictionLine: false,
    landingHint: false,
    foulHints: true
  },
  feel: {
    powerCurve: "realistic",
    spinSensitivity: 1,
    elevationSensitivity: 1
  },
  camera: {
    orbitSensitivity: 1,
    aimSensitivity: 1,
    defaultStance: "stand",
    lowView: false
  }
};

export interface SettingsStore {
  get(): AppSettings;
  set(next: AppSettings): AppSettings;
  patch(next: Partial<AppSettings>): AppSettings;
  reset(): AppSettings;
}

export function createSettingsStore(storage: Storage = window.localStorage): SettingsStore {
  let current = readSettings(storage);
  return {
    get: () => current,
    set: (next) => {
      current = normalizeSettings(next);
      storage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    },
    patch: (next) => {
      current = normalizeSettings({
        ...current,
        ...next,
        assists: { ...current.assists, ...next.assists },
        feel: { ...current.feel, ...next.feel },
        camera: { ...current.camera, ...next.camera }
      });
      storage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    },
    reset: () => {
      current = DEFAULT_SETTINGS;
      storage.setItem(STORAGE_KEY, JSON.stringify(current));
      return current;
    }
  };
}

export function normalizeSettings(value: unknown): AppSettings {
  const input = isRecord(value) ? value : {};
  const assists = isRecord(input.assists) ? input.assists : {};
  const feel = isRecord(input.feel) ? input.feel : {};
  const camera = isRecord(input.camera) ? input.camera : {};
  return {
    assists: {
      aimGuide: booleanOr(assists.aimGuide, DEFAULT_SETTINGS.assists.aimGuide),
      predictionLine: booleanOr(assists.predictionLine, DEFAULT_SETTINGS.assists.predictionLine),
      landingHint: booleanOr(assists.landingHint, DEFAULT_SETTINGS.assists.landingHint),
      foulHints: booleanOr(assists.foulHints, DEFAULT_SETTINGS.assists.foulHints)
    },
    feel: {
      powerCurve: feel.powerCurve === "stable" ? "stable" : "realistic",
      spinSensitivity: clampNumber(feel.spinSensitivity, 0.5, 1.5, 1),
      elevationSensitivity: clampNumber(feel.elevationSensitivity, 0.5, 1.5, 1)
    },
    camera: {
      orbitSensitivity: clampNumber(camera.orbitSensitivity, 0.5, 1.5, 1),
      aimSensitivity: clampNumber(camera.aimSensitivity, 0.5, 1.5, 1),
      defaultStance: camera.defaultStance === "low" || camera.defaultStance === "aim" ? camera.defaultStance : "stand",
      lowView: booleanOr(camera.lowView, DEFAULT_SETTINGS.camera.lowView)
    }
  };
}

function readSettings(storage: Storage): AppSettings {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
```

- [ ] **Step 4: Run settings tests and commit**

Run:

```bash
npm test -- src/app/settings.test.ts
```

Expected: pass all tests in `settings.test.ts`.

Commit:

```bash
git add src/app/settings.ts src/app/settings.test.ts
git commit -m "feat: add app settings store"
```

## Task 2: App Router

**Files:**
- Create: `src/app/router.ts`
- Create: `src/app/router.test.ts`

- [ ] **Step 1: Write failing router tests**

Create `src/app/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAppRouter } from "./router";

describe("AppRouter", () => {
  it("starts on the home screen", () => {
    const router = createAppRouter();
    expect(router.current()).toEqual({ name: "home" });
  });

  it("navigates between product screens", () => {
    const router = createAppRouter();
    router.go({ name: "settings", from: "home" });
    expect(router.current()).toEqual({ name: "settings", from: "home" });
    router.go({ name: "rules", from: "settings" });
    expect(router.current()).toEqual({ name: "rules", from: "settings" });
  });

  it("returns to the previous screen when one is present", () => {
    const router = createAppRouter({ name: "settings", from: "game" });
    router.back();
    expect(router.current()).toEqual({ name: "game" });
  });

  it("falls back to home when there is no previous screen", () => {
    const router = createAppRouter({ name: "stats" });
    router.back();
    expect(router.current()).toEqual({ name: "home" });
  });
});
```

- [ ] **Step 2: Run the failing router tests**

Run:

```bash
npm test -- src/app/router.test.ts
```

Expected: fail because `src/app/router.ts` does not exist.

- [ ] **Step 3: Implement `src/app/router.ts`**

Create `src/app/router.ts`:

```ts
export type AppScreenName = "home" | "mode" | "settings" | "rules" | "game" | "stats";

export interface AppRoute {
  name: AppScreenName;
  from?: AppScreenName;
}

export interface AppRouter {
  current(): AppRoute;
  go(route: AppRoute): AppRoute;
  back(): AppRoute;
}

export function createAppRouter(initial: AppRoute = { name: "home" }): AppRouter {
  let current = initial;
  return {
    current: () => current,
    go: (route) => {
      current = route;
      return current;
    },
    back: () => {
      current = current.from ? { name: current.from } : { name: "home" };
      return current;
    }
  };
}
```

- [ ] **Step 4: Run router tests and commit**

Run:

```bash
npm test -- src/app/router.test.ts
```

Expected: pass all tests in `router.test.ts`.

Commit:

```bash
git add src/app/router.ts src/app/router.test.ts
git commit -m "feat: add app router"
```

## Task 3: Solo Clearance Session

**Files:**
- Create: `src/modes/solo-clearance/session.ts`
- Create: `src/modes/solo-clearance/session.test.ts`

- [ ] **Step 1: Write failing solo session tests**

Create `src/modes/solo-clearance/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSoloClearanceSession } from "./session";
import type { ShotResult } from "../../game/types";

function shot(overrides: Partial<ShotResult> = {}): ShotResult {
  return {
    firstContactBall: 1,
    pocketedBalls: [],
    railContacts: [{ ball: 1, rail: "top" }],
    offTableBalls: [],
    cueBallPocketed: false,
    breakStats: { objectBallsToRail: 4 },
    ...overrides
  };
}

describe("SoloClearanceSession", () => {
  it("moves from ready to open after the opening shot", () => {
    const session = createSoloClearanceSession();
    expect(session.snapshot().phase).toBe("ready");

    session.startBreak();
    session.settleShot(shot());

    expect(session.snapshot().phase).toBe("open");
    expect(session.snapshot().stats.shots).toBe(1);
  });

  it("assigns a target group from the first legal open-table pocket", () => {
    const session = createSoloClearanceSession();
    session.startBreak();
    session.settleShot(shot());

    session.settleShot(shot({
      firstContactBall: 10,
      pocketedBalls: [{ ball: 10, pocket: "tc" }]
    }));

    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("groupClear");
    expect(snapshot.targetGroup).toBe("stripes");
    expect(snapshot.remainingTargetBalls).not.toContain(10);
  });

  it("records fouls as ball in hand without ending the session", () => {
    const session = createSoloClearanceSession();
    session.startBreak();
    session.settleShot(shot());

    session.settleShot(shot({
      firstContactBall: null,
      railContacts: []
    }));

    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("open");
    expect(snapshot.ballInHand).toBe(true);
    expect(snapshot.stats.fouls).toBe(1);
    expect(snapshot.lastMessage).toContain("未碰到目标球");
  });

  it("enters the eight phase after the target group is cleared", () => {
    const session = createSoloClearanceSession();
    session.startBreak();
    session.settleShot(shot());

    session.settleShot(shot({
      firstContactBall: 1,
      pocketedBalls: [1, 2, 3, 4, 5, 6, 7].map((ball) => ({ ball, pocket: "tc" as const }))
    }));

    expect(session.snapshot().phase).toBe("eight");
    expect(session.snapshot().targetGroup).toBe("solids");
  });

  it("completes the session when the eight is legally pocketed in the eight phase", () => {
    const session = createSoloClearanceSession();
    session.startBreak();
    session.settleShot(shot());
    session.settleShot(shot({
      firstContactBall: 1,
      pocketedBalls: [1, 2, 3, 4, 5, 6, 7].map((ball) => ({ ball, pocket: "tc" as const }))
    }));

    session.settleShot(shot({
      firstContactBall: 8,
      pocketedBalls: [{ ball: 8, pocket: "br" }]
    }));

    expect(session.snapshot().phase).toBe("complete");
    expect(session.snapshot().stats.pocketed).toBe(8);
  });

  it("respots an early eight as a serious foul", () => {
    const session = createSoloClearanceSession();
    session.startBreak();
    session.settleShot(shot());

    const decision = session.settleShot(shot({
      firstContactBall: 1,
      pocketedBalls: [{ ball: 8, pocket: "br" }]
    }));

    expect(session.snapshot().phase).toBe("open");
    expect(session.snapshot().stats.fouls).toBe(1);
    expect(decision.respotBalls).toEqual([8]);
  });
});
```

- [ ] **Step 2: Run the failing solo session tests**

Run:

```bash
npm test -- src/modes/solo-clearance/session.test.ts
```

Expected: fail because `src/modes/solo-clearance/session.ts` does not exist.

- [ ] **Step 3: Implement `src/modes/solo-clearance/session.ts`**

Create `src/modes/solo-clearance/session.ts`:

```ts
import { ballsForGroup, groupForBall } from "../../game/rules";
import type { BallGroup, ShotResult } from "../../game/types";

export type SoloPhase = "ready" | "break" | "open" | "groupClear" | "eight" | "complete";

export interface SoloStats {
  shots: number;
  fouls: number;
  pocketed: number;
  currentRun: number;
  bestRun: number;
  startedAt: number;
  completedAt: number | null;
}

export interface SoloSnapshot {
  phase: SoloPhase;
  targetGroup: BallGroup | null;
  remainingTargetBalls: number[];
  remainingBalls: number[];
  ballInHand: boolean;
  lastMessage: string;
  stats: SoloStats;
}

export interface SoloShotDecision {
  foul: boolean;
  foulReasons: string[];
  ballInHand: boolean;
  respotBalls: number[];
  message: string;
}

export interface SoloClearanceSession {
  snapshot(): SoloSnapshot;
  reset(now?: number): SoloSnapshot;
  startBreak(): SoloSnapshot;
  placeCueBall(): SoloSnapshot;
  settleShot(result: ShotResult, now?: number): SoloShotDecision;
}

export function createSoloClearanceSession(now = 0): SoloClearanceSession {
  let phase: SoloPhase = "ready";
  let targetGroup: BallGroup | null = null;
  let remainingBalls = new Set(Array.from({ length: 15 }, (_, index) => index + 1));
  let ballInHand = false;
  let lastMessage = "准备开球。";
  let stats = createStats(now);

  function snapshot(): SoloSnapshot {
    return {
      phase,
      targetGroup,
      remainingTargetBalls: targetGroup ? ballsForGroup(targetGroup).filter((ball) => remainingBalls.has(ball)) : [],
      remainingBalls: [...remainingBalls].sort((a, b) => a - b),
      ballInHand,
      lastMessage,
      stats: { ...stats }
    };
  }

  function reset(resetAt = 0): SoloSnapshot {
    phase = "ready";
    targetGroup = null;
    remainingBalls = new Set(Array.from({ length: 15 }, (_, index) => index + 1));
    ballInHand = false;
    lastMessage = "准备开球。";
    stats = createStats(resetAt);
    return snapshot();
  }

  function startBreak(): SoloSnapshot {
    phase = "break";
    ballInHand = false;
    lastMessage = "开球。";
    return snapshot();
  }

  function placeCueBall(): SoloSnapshot {
    ballInHand = false;
    lastMessage = "母球已摆放。";
    return snapshot();
  }

  function settleShot(result: ShotResult, settledAt = 0): SoloShotDecision {
    if (phase === "ready") phase = "break";
    stats.shots += 1;
    const foulReasons = collectFoulReasons(result);
    const pocketed = result.pocketedBalls.map((item) => item.ball).filter((ball) => ball > 0);
    const respotBalls: number[] = [];
    const earlyEight = pocketed.includes(8) && phase !== "eight";

    if (earlyEight) {
      foulReasons.push("黑八提前入袋");
      respotBalls.push(8);
    }

    const foul = foulReasons.length > 0;
    if (foul) {
      stats.fouls += 1;
      stats.currentRun = 0;
      ballInHand = true;
      commitPocketed(pocketed.filter((ball) => ball !== 8));
      if (phase === "break") phase = "open";
      lastMessage = `${foulReasons.join("，")}，自由球。`;
      return { foul, foulReasons, ballInHand, respotBalls, message: lastMessage };
    }

    commitPocketed(pocketed);
    if (pocketed.length > 0) {
      stats.pocketed += pocketed.length;
      stats.currentRun += pocketed.length;
      stats.bestRun = Math.max(stats.bestRun, stats.currentRun);
    } else {
      stats.currentRun = 0;
    }

    if (phase === "break") phase = "open";
    if (phase === "open") assignGroupFromPocketed(pocketed);
    if (phase === "groupClear" && targetGroup && ballsForGroup(targetGroup).every((ball) => !remainingBalls.has(ball))) {
      phase = "eight";
    }
    if (phase === "eight" && pocketed.includes(8)) {
      phase = "complete";
      stats.completedAt = settledAt;
    }

    ballInHand = false;
    lastMessage = phase === "complete" ? "清台完成。" : pocketed.length > 0 ? "合法进球。" : "未进球，继续练习。";
    return { foul: false, foulReasons: [], ballInHand, respotBalls, message: lastMessage };
  }

  function assignGroupFromPocketed(pocketed: number[]): void {
    const group = pocketed.map(groupForBall).find((item): item is BallGroup => item !== null);
    if (!group) return;
    targetGroup = group;
    phase = ballsForGroup(group).every((ball) => !remainingBalls.has(ball)) ? "eight" : "groupClear";
  }

  function commitPocketed(pocketed: number[]): void {
    for (const ball of pocketed) remainingBalls.delete(ball);
  }

  return { snapshot, reset, startBreak, placeCueBall, settleShot };
}

function createStats(now: number): SoloStats {
  return {
    shots: 0,
    fouls: 0,
    pocketed: 0,
    currentRun: 0,
    bestRun: 0,
    startedAt: now,
    completedAt: null
  };
}

function collectFoulReasons(result: ShotResult): string[] {
  const reasons: string[] = [];
  if (result.cueBallPocketed || result.pocketedBalls.some((item) => item.ball === 0)) reasons.push("母球进袋");
  if (result.offTableBalls.includes(0)) reasons.push("母球离台");
  if (result.offTableBalls.some((ball) => ball > 0)) reasons.push("目标球离台");
  if (result.firstContactBall === null) reasons.push("未碰到目标球");
  return reasons;
}
```

- [ ] **Step 4: Run solo session tests and commit**

Run:

```bash
npm test -- src/modes/solo-clearance/session.test.ts
```

Expected: pass all tests in `session.test.ts`.

Commit:

```bash
git add src/modes/solo-clearance/session.ts src/modes/solo-clearance/session.test.ts
git commit -m "feat: add solo clearance session"
```

## Task 4: HUD View Model

**Files:**
- Create: `src/ui/hudModel.ts`
- Create: `src/ui/hudModel.test.ts`

- [ ] **Step 1: Write failing HUD model tests**

Create `src/ui/hudModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHudModel } from "./hudModel";
import type { AppSettings } from "../app/settings";
import type { SoloSnapshot } from "../modes/solo-clearance/session";

const settings: AppSettings = {
  assists: { aimGuide: true, predictionLine: false, landingHint: false, foulHints: true },
  feel: { powerCurve: "realistic", spinSensitivity: 1, elevationSensitivity: 1 },
  camera: { orbitSensitivity: 1, aimSensitivity: 1, defaultStance: "stand", lowView: false }
};

const snapshot: SoloSnapshot = {
  phase: "groupClear",
  targetGroup: "solids",
  remainingTargetBalls: [2, 3],
  remainingBalls: [2, 3, 8, 9],
  ballInHand: true,
  lastMessage: "未碰到目标球，自由球。",
  stats: {
    shots: 4,
    fouls: 1,
    pocketed: 5,
    currentRun: 0,
    bestRun: 3,
    startedAt: 0,
    completedAt: null
  }
};

describe("createHudModel", () => {
  it("maps solo session state into compact HUD labels", () => {
    const model = createHudModel(snapshot, settings, 92_000);

    expect(model.phaseLabel).toBe("清组");
    expect(model.targetLabel).toBe("目标 1-7");
    expect(model.remainingLabel).toBe("剩余 2");
    expect(model.statusLine).toBe("未碰到目标球，自由球。");
    expect(model.stats).toEqual(["杆数 4", "犯规 1", "进球 5", "用时 01:32"]);
  });

  it("exposes assist flags for UI and rendering", () => {
    const model = createHudModel(snapshot, {
      ...settings,
      assists: { ...settings.assists, predictionLine: true, landingHint: true }
    }, 0);

    expect(model.assists.predictionLine).toBe(true);
    expect(model.assists.landingHint).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing HUD model tests**

Run:

```bash
npm test -- src/ui/hudModel.test.ts
```

Expected: fail because `src/ui/hudModel.ts` does not exist.

- [ ] **Step 3: Implement `src/ui/hudModel.ts`**

Create `src/ui/hudModel.ts`:

```ts
import type { AppSettings } from "../app/settings";
import type { SoloSnapshot } from "../modes/solo-clearance/session";

export interface HudModel {
  phaseLabel: string;
  targetLabel: string;
  remainingLabel: string;
  statusLine: string;
  ballInHandLabel: string;
  stats: string[];
  assists: AppSettings["assists"];
}

export function createHudModel(snapshot: SoloSnapshot, settings: AppSettings, now: number): HudModel {
  return {
    phaseLabel: phaseLabel(snapshot.phase),
    targetLabel: targetLabel(snapshot),
    remainingLabel: `剩余 ${snapshot.remainingTargetBalls.length}`,
    statusLine: snapshot.lastMessage,
    ballInHandLabel: snapshot.ballInHand ? "自由球" : "正常击球",
    stats: [
      `杆数 ${snapshot.stats.shots}`,
      `犯规 ${snapshot.stats.fouls}`,
      `进球 ${snapshot.stats.pocketed}`,
      `用时 ${formatElapsed(now - snapshot.stats.startedAt)}`
    ],
    assists: settings.assists
  };
}

function phaseLabel(phase: SoloSnapshot["phase"]): string {
  switch (phase) {
    case "ready":
      return "准备";
    case "break":
      return "开球";
    case "open":
      return "开台";
    case "groupClear":
      return "清组";
    case "eight":
      return "黑八";
    case "complete":
      return "完成";
  }
}

function targetLabel(snapshot: SoloSnapshot): string {
  if (snapshot.phase === "eight") return "目标 黑八";
  if (snapshot.targetGroup === "solids") return "目标 1-7";
  if (snapshot.targetGroup === "stripes") return "目标 9-15";
  return "目标 开台";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run HUD model tests and commit**

Run:

```bash
npm test -- src/ui/hudModel.test.ts
```

Expected: pass all tests in `hudModel.test.ts`.

Commit:

```bash
git add src/ui/hudModel.ts src/ui/hudModel.test.ts
git commit -m "feat: add solo HUD model"
```

## Task 5: Assist Rendering Options

**Files:**
- Create: `src/rendering/assistOptions.ts`
- Create: `src/rendering/assistOptions.test.ts`
- Modify: `src/game/scene.ts`

- [ ] **Step 1: Write failing assist option tests**

Create `src/rendering/assistOptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAssistOptions } from "./assistOptions";
import type { AssistSettings } from "../app/settings";

describe("createAssistOptions", () => {
  it("keeps aim guide on while prediction and landing hints follow settings", () => {
    const assists: AssistSettings = {
      aimGuide: true,
      predictionLine: false,
      landingHint: true,
      foulHints: true
    };

    expect(createAssistOptions(assists)).toEqual({
      aimGuide: true,
      predictionLine: false,
      landingHint: true
    });
  });

  it("hides all aim visuals when aim guide is disabled", () => {
    expect(createAssistOptions({
      aimGuide: false,
      predictionLine: true,
      landingHint: true,
      foulHints: true
    })).toEqual({
      aimGuide: false,
      predictionLine: false,
      landingHint: false
    });
  });
});
```

- [ ] **Step 2: Run the failing assist tests**

Run:

```bash
npm test -- src/rendering/assistOptions.test.ts
```

Expected: fail because `src/rendering/assistOptions.ts` does not exist.

- [ ] **Step 3: Implement assist options and scene signature**

Create `src/rendering/assistOptions.ts`:

```ts
import type { AssistSettings } from "../app/settings";

export interface SceneAssistOptions {
  aimGuide: boolean;
  predictionLine: boolean;
  landingHint: boolean;
}

export function createAssistOptions(settings: AssistSettings): SceneAssistOptions {
  if (!settings.aimGuide) {
    return { aimGuide: false, predictionLine: false, landingHint: false };
  }
  return {
    aimGuide: true,
    predictionLine: settings.predictionLine,
    landingHint: settings.landingHint
  };
}
```

Modify `src/game/scene.ts`:

```ts
import type { SceneAssistOptions } from "../rendering/assistOptions";
```

Change the method signature:

```ts
updateAimVisuals(controls: ControlsController, balls: BallSnapshot[], assists: SceneAssistOptions = {
  aimGuide: true,
  predictionLine: true,
  landingHint: false
}): void {
```

At the start of `updateAimVisuals`, replace the current guard with:

```ts
const cue = balls.find((ball) => ball.number === 0);
if (!cue || !cue.active || controls.mode !== "aim" || !assists.aimGuide) {
  this.setAimMeshesEnabled(false);
  return;
}
this.setAimMeshesEnabled(true);
```

After assigning `this.lastPrediction`, replace the existing prediction line call with:

```ts
if (assists.predictionLine || assists.landingHint) {
  this.syncPredictionLine(this.lastPrediction, assists);
} else {
  this.cuePath?.setEnabled(false);
  this.objectPath?.setEnabled(false);
}
```

Change `syncPredictionLine` to accept assist options:

```ts
private syncPredictionLine(prediction: PredictionRoute, assists: SceneAssistOptions): void {
  const cuePoints = prediction.cuePath.map((point) => new Vector3(point.x, TABLE.ballY + 0.004, point.z));
  this.cuePath = MeshBuilder.CreateLines(
    "cue-path",
    { points: cuePoints, updatable: true, instance: this.cuePath ?? undefined },
    this.scene
  );
  this.cuePath.color = Color3.FromHexString("#f9f2bb");
  this.cuePath.setEnabled(assists.predictionLine);

  if (prediction.objectPath.length > 0) {
    const objectPoints = prediction.objectPath.map((point) => new Vector3(point.x, TABLE.ballY + 0.006, point.z));
    this.objectPath = MeshBuilder.CreateLines(
      "object-path",
      { points: objectPoints, updatable: true, instance: this.objectPath ?? undefined },
      this.scene
    );
    this.objectPath.color = Color3.FromHexString("#63d6ff");
    this.objectPath.setEnabled(assists.predictionLine || assists.landingHint);
  } else {
    this.objectPath?.setEnabled(false);
  }
}
```

- [ ] **Step 4: Run assist tests, existing tests, and commit**

Run:

```bash
npm test -- src/rendering/assistOptions.test.ts src/game/geometry.test.ts
npm run build
```

Expected: assist tests pass, geometry tests pass, build succeeds.

Commit:

```bash
git add src/rendering/assistOptions.ts src/rendering/assistOptions.test.ts src/game/scene.ts
git commit -m "feat: make scene assists configurable"
```

## Task 6: Product Screen Renderers

**Files:**
- Create: `src/ui/productScreens.ts`
- Create: `src/ui/productScreens.test.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing product screen tests**

Create `src/ui/productScreens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderHomeScreen, renderRulesScreen, renderStatsScreen } from "./productScreens";
import type { SoloSnapshot } from "../modes/solo-clearance/session";

const snapshot: SoloSnapshot = {
  phase: "eight",
  targetGroup: "solids",
  remainingTargetBalls: [],
  remainingBalls: [8, 9, 10],
  ballInHand: false,
  lastMessage: "进入黑八阶段。",
  stats: {
    shots: 12,
    fouls: 2,
    pocketed: 7,
    currentRun: 1,
    bestRun: 3,
    startedAt: 0,
    completedAt: null
  }
};

describe("product screens", () => {
  it("renders home actions", () => {
    const html = renderHomeScreen(true);
    expect(html).toContain("继续清台");
    expect(html).toContain("新开清台");
    expect(html).toContain("规则");
  });

  it("renders concise solo rules", () => {
    const html = renderRulesScreen();
    expect(html).toContain("先清完目标组");
    expect(html).toContain("犯规不会结束本局");
  });

  it("renders current-session stats", () => {
    const html = renderStatsScreen(snapshot, 125_000);
    expect(html).toContain("杆数");
    expect(html).toContain("12");
    expect(html).toContain("02:05");
  });
});
```

- [ ] **Step 2: Run the failing product screen tests**

Run:

```bash
npm test -- src/ui/productScreens.test.ts
```

Expected: fail because `src/ui/productScreens.ts` does not exist.

- [ ] **Step 3: Implement product screen renderers**

Create `src/ui/productScreens.ts`:

```ts
import type { SoloSnapshot } from "../modes/solo-clearance/session";

export function renderHomeScreen(hasSession: boolean): string {
  return `
    <main class="product-screen home-screen">
      <section class="product-panel">
        <p class="eyebrow">中式八球</p>
        <h1>单人清台</h1>
        <div class="product-actions">
          ${hasSession ? '<button data-action="continue-session">继续清台</button>' : ""}
          <button data-action="new-session">新开清台</button>
          <button data-action="mode">模式选择</button>
          <button data-action="settings">设置</button>
          <button data-action="rules">规则</button>
          <button data-action="stats">统计</button>
        </div>
      </section>
    </main>
  `;
}

export function renderModeScreen(): string {
  return `
    <main class="product-screen">
      <section class="product-panel">
        <p class="eyebrow">模式选择</p>
        <h1>单人清台</h1>
        <p>从开球开始，清完目标组后打黑八。犯规只提示并进入自由球。</p>
        <div class="product-actions">
          <button data-action="new-session">开始</button>
          <button data-action="home">返回首页</button>
        </div>
      </section>
    </main>
  `;
}

export function renderRulesScreen(): string {
  return `
    <main class="product-screen">
      <section class="product-panel readable">
        <p class="eyebrow">规则</p>
        <h1>清台目标</h1>
        <p>开球后进入开台阶段，第一次合法进球确定目标组。先清完目标组，再打进黑八完成本局。</p>
        <p>犯规不会结束本局。母球进袋、未碰目标球、目标球离台等情况会记录犯规，并进入自由球。</p>
        <p>第一版单人清台不要求黑八报袋。</p>
        <button data-action="back">返回</button>
      </section>
    </main>
  `;
}

export function renderStatsScreen(snapshot: SoloSnapshot, now: number): string {
  const elapsed = formatElapsed((snapshot.stats.completedAt ?? now) - snapshot.stats.startedAt);
  return `
    <main class="product-screen">
      <section class="product-panel">
        <p class="eyebrow">当前局概览</p>
        <h1>${phaseTitle(snapshot.phase)}</h1>
        <dl class="stats-grid">
          <div><dt>杆数</dt><dd>${snapshot.stats.shots}</dd></div>
          <div><dt>犯规</dt><dd>${snapshot.stats.fouls}</dd></div>
          <div><dt>进球</dt><dd>${snapshot.stats.pocketed}</dd></div>
          <div><dt>最佳连续</dt><dd>${snapshot.stats.bestRun}</dd></div>
          <div><dt>用时</dt><dd>${elapsed}</dd></div>
        </dl>
        <button data-action="back">返回</button>
      </section>
    </main>
  `;
}

function phaseTitle(phase: SoloSnapshot["phase"]): string {
  switch (phase) {
    case "ready":
      return "准备开球";
    case "break":
      return "开球中";
    case "open":
      return "开台";
    case "groupClear":
      return "清目标组";
    case "eight":
      return "黑八阶段";
    case "complete":
      return "清台完成";
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Add product screen CSS**

Append to `src/styles/app.css`:

```css
.product-screen {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 32px;
  background: #101312;
}

.product-panel {
  width: min(720px, 100%);
  padding: 28px;
  border: 1px solid rgba(244, 239, 226, 0.14);
  border-radius: 8px;
  background: rgba(14, 17, 16, 0.86);
}

.product-panel h1 {
  margin: 0 0 16px;
  color: #fff8dd;
  font-size: 42px;
  letter-spacing: 0;
}

.product-panel p {
  color: #d6ccb1;
  line-height: 1.6;
}

.eyebrow {
  margin: 0 0 8px;
  color: #7bd6ff;
  font-size: 12px;
  font-weight: 800;
}

.product-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.product-actions button,
.product-panel button {
  min-height: 40px;
  border: 1px solid rgba(244, 239, 226, 0.18);
  border-radius: 8px;
  background: rgba(249, 206, 104, 0.12);
  color: #f5efd8;
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 18px;
}

.stats-grid div {
  padding: 12px;
  border: 1px solid rgba(244, 239, 226, 0.12);
  border-radius: 8px;
}

.stats-grid dt {
  color: #9ab7ac;
  font-size: 12px;
}

.stats-grid dd {
  margin: 4px 0 0;
  color: #fff8dd;
  font-size: 24px;
  font-weight: 800;
}
```

- [ ] **Step 5: Run screen tests and commit**

Run:

```bash
npm test -- src/ui/productScreens.test.ts
npm run build
```

Expected: product screen tests pass, build succeeds.

Commit:

```bash
git add src/ui/productScreens.ts src/ui/productScreens.test.ts src/styles/app.css
git commit -m "feat: add product screen renderers"
```

## Task 7: Integrate Product Shell into `EightBallApp`

**Files:**
- Modify: `src/ui/EightBallApp.ts`
- Modify: `src/game/scene.ts` from Task 5 is already prepared for assist options.

- [ ] **Step 1: Add integration imports and fields**

Modify the top of `src/ui/EightBallApp.ts`:

```ts
import { createSettingsStore, type SettingsStore } from "../app/settings";
import { createAppRouter, type AppRouter } from "../app/router";
import { createAssistOptions } from "../rendering/assistOptions";
import { createSoloClearanceSession, type SoloClearanceSession } from "../modes/solo-clearance/session";
import { createHudModel } from "./hudModel";
import { renderHomeScreen, renderModeScreen, renderRulesScreen, renderStatsScreen } from "./productScreens";
```

Add fields inside `EightBallApp`:

```ts
private readonly settings: SettingsStore = createSettingsStore();
private readonly router: AppRouter = createAppRouter();
private readonly solo: SoloClearanceSession = createSoloClearanceSession(performance.now());
private gameStarted = false;
```

- [ ] **Step 2: Route launch through the home screen**

In `launch()`, replace the direct shell rendering path with:

```ts
this.renderRoute();
```

Add this method:

```ts
private renderRoute(): void {
  const route = this.router.current();
  if (route.name === "home") {
    this.root.innerHTML = renderHomeScreen(this.gameStarted);
    this.bindProductActions();
    return;
  }
  if (route.name === "mode") {
    this.root.innerHTML = renderModeScreen();
    this.bindProductActions();
    return;
  }
  if (route.name === "rules") {
    this.root.innerHTML = renderRulesScreen();
    this.bindProductActions();
    return;
  }
  if (route.name === "stats") {
    this.root.innerHTML = renderStatsScreen(this.solo.snapshot(), performance.now());
    this.bindProductActions();
    return;
  }
  if (route.name === "game") {
    void this.mountGame();
    return;
  }
  this.root.innerHTML = renderHomeScreen(this.gameStarted);
  this.bindProductActions();
}
```

Add this method:

```ts
private bindProductActions(): void {
  this.root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;
      if (action === "new-session") {
        this.startNewSoloSession();
      } else if (action === "continue-session") {
        this.router.go({ name: "game", from: "home" });
        this.renderRoute();
      } else if (action === "mode") {
        this.router.go({ name: "mode", from: this.router.current().name });
        this.renderRoute();
      } else if (action === "rules") {
        this.router.go({ name: "rules", from: this.router.current().name });
        this.renderRoute();
      } else if (action === "stats") {
        this.router.go({ name: "stats", from: this.router.current().name });
        this.renderRoute();
      } else if (action === "back") {
        this.router.back();
        this.renderRoute();
      } else if (action === "home") {
        this.router.go({ name: "home" });
        this.renderRoute();
      }
    });
  });
}
```

- [ ] **Step 3: Mount existing game shell only for the game route**

Move the old launch shell creation into a new method:

```ts
private async mountGame(): Promise<void> {
  if (isUnsupportedMobile()) {
    this.root.innerHTML = '<main class="unsupported"><h1>暂不支持移动端</h1><p>请使用桌面浏览器进入。</p></main>';
    return;
  }

  this.root.innerHTML = renderShell();
  this.dom = collectDomRefs(this.root);
  installIcon(this.dom.resetButton, RotateCcw);
  installIcon(this.dom.aimButton, Crosshair);
  installIcon(this.dom.placeButton, Hand);

  this.physics = await BilliardsPhysics.create();
  this.view = new BilliardsScene(this.dom.canvas);
  this.bindEvents();
  this.syncView();
  this.updateHud();
  this.view.run(() => this.frame());
}
```

Add:

```ts
private startNewSoloSession(): void {
  this.gameStarted = true;
  this.rules.reset();
  this.state = createInitialGameState();
  this.solo.reset(performance.now());
  this.solo.startBreak();
  this.calledPocket = undefined;
  this.message = "单人清台：开球。";
  this.router.go({ name: "game", from: "home" });
  this.renderRoute();
}
```

- [ ] **Step 4: Settle shots through the solo session**

In `onShotComplete`, after the rules decision is computed, add:

```ts
const soloDecision = this.solo.settleShot(result, performance.now());
```

Then set the displayed message from solo mode:

```ts
this.message = soloDecision.message;
```

Use the solo ball-in-hand flag:

```ts
if (this.solo.snapshot().ballInHand) {
  this.controls.placeBall();
  this.placementPoint = this.defaultCuePlacement();
} else {
  this.controls.readyAfterShot();
  this.placementPoint = null;
}
```

Keep the existing `RulesEngine` call during this task so current rule behaviors remain available. Later cleanup can remove opponent-specific fields after manual QA proves the solo session is the source of truth.

- [ ] **Step 5: Pass assist settings into the scene**

In `frame()`, replace:

```ts
view.updateAimVisuals(this.controls, balls);
```

with:

```ts
view.updateAimVisuals(this.controls, balls, createAssistOptions(this.settings.get().assists));
```

- [ ] **Step 6: Use the HUD model in `updateHud`**

At the start of `updateHud`, create:

```ts
const soloSnapshot = this.solo.snapshot();
const hud = createHudModel(soloSnapshot, this.settings.get(), performance.now());
```

Set these existing text nodes from `hud`:

```ts
this.dom.phase.textContent = hud.phaseLabel;
this.dom.mode.textContent = modeLabel(this.controls.mode);
this.dom.message.textContent = hud.statusLine;
```

Hide the called-pocket panel in solo mode:

```ts
this.dom.pocketPanel.hidden = true;
```

- [ ] **Step 7: Run build and commit**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build succeeds.

Commit:

```bash
git add src/ui/EightBallApp.ts
git commit -m "feat: integrate solo product shell"
```

## Task 8: Settings Screen Integration

**Files:**
- Modify: `src/ui/productScreens.ts`
- Modify: `src/ui/productScreens.test.ts`
- Modify: `src/ui/EightBallApp.ts`

- [ ] **Step 1: Add settings screen tests**

Append to `src/ui/productScreens.test.ts`:

```ts
import { DEFAULT_SETTINGS } from "../app/settings";
import { renderSettingsScreen } from "./productScreens";

describe("settings screen", () => {
  it("renders assist and camera controls with current values", () => {
    const html = renderSettingsScreen(DEFAULT_SETTINGS);
    expect(html).toContain("预测线");
    expect(html).toContain('data-setting="assists.predictionLine"');
    expect(html).toContain("镜头灵敏度");
    expect(html).toContain('data-setting="camera.aimSensitivity"');
  });
});
```

- [ ] **Step 2: Run the failing settings screen test**

Run:

```bash
npm test -- src/ui/productScreens.test.ts
```

Expected: fail because `renderSettingsScreen` is not exported.

- [ ] **Step 3: Implement `renderSettingsScreen`**

Add to `src/ui/productScreens.ts`:

```ts
import type { AppSettings } from "../app/settings";

export function renderSettingsScreen(settings: AppSettings): string {
  return `
    <main class="product-screen">
      <section class="product-panel readable">
        <p class="eyebrow">设置</p>
        <h1>辅助与手感</h1>
        <label><input type="checkbox" data-setting="assists.aimGuide" ${settings.assists.aimGuide ? "checked" : ""}> 准星 / 球杆方向</label>
        <label><input type="checkbox" data-setting="assists.predictionLine" ${settings.assists.predictionLine ? "checked" : ""}> 预测线</label>
        <label><input type="checkbox" data-setting="assists.landingHint" ${settings.assists.landingHint ? "checked" : ""}> 落点提示</label>
        <label><input type="checkbox" data-setting="assists.foulHints" ${settings.assists.foulHints ? "checked" : ""}> 犯规提示</label>
        <label>旋转灵敏度 <input type="range" min="0.5" max="1.5" step="0.1" value="${settings.feel.spinSensitivity}" data-setting="feel.spinSensitivity"></label>
        <label>杆高灵敏度 <input type="range" min="0.5" max="1.5" step="0.1" value="${settings.feel.elevationSensitivity}" data-setting="feel.elevationSensitivity"></label>
        <label>镜头灵敏度 <input type="range" min="0.5" max="1.5" step="0.1" value="${settings.camera.aimSensitivity}" data-setting="camera.aimSensitivity"></label>
        <button data-action="back">返回</button>
      </section>
    </main>
  `;
}
```

- [ ] **Step 4: Wire settings route and controls**

In `src/ui/EightBallApp.ts`, import `renderSettingsScreen`.

In `renderRoute()`, add:

```ts
if (route.name === "settings") {
  this.root.innerHTML = renderSettingsScreen(this.settings.get());
  this.bindProductActions();
  this.bindSettingsControls();
  return;
}
```

In `bindProductActions()`, add:

```ts
} else if (action === "settings") {
  this.router.go({ name: "settings", from: this.router.current().name });
  this.renderRoute();
```

Add:

```ts
private bindSettingsControls(): void {
  this.root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.setting;
      const current = this.settings.get();
      if (key === "assists.predictionLine") {
        this.settings.patch({ assists: { ...current.assists, predictionLine: input.checked } });
      } else if (key === "assists.landingHint") {
        this.settings.patch({ assists: { ...current.assists, landingHint: input.checked } });
      } else if (key === "assists.aimGuide") {
        this.settings.patch({ assists: { ...current.assists, aimGuide: input.checked } });
      } else if (key === "assists.foulHints") {
        this.settings.patch({ assists: { ...current.assists, foulHints: input.checked } });
      } else if (key === "feel.spinSensitivity") {
        this.settings.patch({ feel: { ...current.feel, spinSensitivity: Number(input.value) } });
      } else if (key === "feel.elevationSensitivity") {
        this.settings.patch({ feel: { ...current.feel, elevationSensitivity: Number(input.value) } });
      } else if (key === "camera.aimSensitivity") {
        this.settings.patch({ camera: { ...current.camera, aimSensitivity: Number(input.value) } });
      }
    });
  });
}
```

- [ ] **Step 5: Run tests, build, and commit**

Run:

```bash
npm test -- src/ui/productScreens.test.ts src/app/settings.test.ts
npm run build
```

Expected: listed tests pass and build succeeds.

Commit:

```bash
git add src/ui/productScreens.ts src/ui/productScreens.test.ts src/ui/EightBallApp.ts
git commit -m "feat: add settings screen"
```

## Task 9: Product HUD Styling and Desktop QA

**Files:**
- Modify: `src/styles/app.css`
- Modify: `src/ui/EightBallApp.ts`

- [ ] **Step 1: Add stable HUD class names to the shell**

In `renderShell()` inside `src/ui/EightBallApp.ts`, keep the existing canvas and controls, and rename the scorebar text semantics through labels rather than changing the DOM shape. Update the status section:

```html
<section class="status-line" aria-live="polite"></section>
```

Add a pause/home button to `.tool-panel`:

```html
<button class="icon-button home-button" title="Home" data-game-action="home">H</button>
```

In `DomRefs`, add:

```ts
homeButton: HTMLButtonElement;
```

In `collectDomRefs`, add:

```ts
homeButton: root.querySelector<HTMLButtonElement>(".home-button")!,
```

In `bindEvents()`, add:

```ts
this.dom.homeButton.addEventListener("click", () => {
  this.router.go({ name: "home" });
  this.renderRoute();
});
```

- [ ] **Step 2: Add CSS refinements**

Append to `src/styles/app.css`:

```css
.home-button {
  grid-column: 2;
  grid-row: 2;
}

.readable {
  max-width: 760px;
}

.readable label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 42px;
  border-bottom: 1px solid rgba(244, 239, 226, 0.08);
  color: #f4efe2;
}

.readable input[type="range"] {
  width: 180px;
}

@media (max-width: 760px) {
  .product-panel h1 {
    font-size: 32px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest test files pass and build succeeds.

- [ ] **Step 4: Start the dev server for manual QA**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 5: Manual desktop QA checklist**

Use the browser to verify:

- Homepage renders first.
- New solo clearance starts the game.
- Settings screen opens and toggling prediction line changes aim visuals after returning to the table.
- Rules screen contains solo clearance rules.
- Stats screen shows current-session values.
- In-game home button returns to the homepage.
- Shot controls still respond: aim, power, spin, shoot, ball-in-hand placement.

- [ ] **Step 6: Commit final integration**

Commit:

```bash
git add src/styles/app.css src/ui/EightBallApp.ts
git commit -m "feat: polish product HUD"
```

## Task 10: Final Verification and Development Branch Finish

**Files:**
- No source files should be changed unless verification finds a concrete defect.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
git status --short
```

Expected:

- `npm test`: 4 or more test files pass, including the new app, solo-clearance, rendering, and UI tests.
- `npm run build`: TypeScript and Vite build succeeds.
- `git status --short`: empty after final commits.

- [ ] **Step 2: Review requirement coverage**

Check the implementation against this list:

- Product shell has home, mode, settings, rules, game, and stats routes.
- Solo clearance starts from opening shot and advances through open, group clear, eight, and complete.
- Fouls record stats and grant ball-in-hand without failing the session.
- Prediction line and landing hint default off and can be changed in settings.
- Called-pocket UI is not shown for solo clearance.
- Stats page shows current-session overview only.
- Existing core tests remain passing.

- [ ] **Step 3: Commit any verification fixes**

If Step 1 or Step 2 exposes a concrete defect, fix that defect with the smallest focused patch and commit:

```bash
git add src/app src/game src/modes src/rendering src/ui src/styles/app.css
git commit -m "fix: complete solo clearance verification"
```

When there are no defects, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: the tasks cover settings, product screens, solo clearance state, foul handling, stats, assist visibility, menu flow, HUD integration, and verification.
- Scope: online multiplayer, AI, persistent history, and training-course systems are intentionally excluded.
- Type consistency: `AppSettings`, `SoloSnapshot`, `SoloClearanceSession`, `HudModel`, and `SceneAssistOptions` are introduced before later tasks reference them.
