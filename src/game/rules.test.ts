import { describe, expect, it } from "vitest";
import { createInitialGameState, RulesEngine } from "./rules";
import type { GameState, PocketId, ShotResult } from "./types";

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

function groupedState(group: "solids" | "stripes" = "solids"): GameState {
  const state = createInitialGameState();
  state.phase = "groups";
  state.players[0].group = group;
  state.players[1].group = group === "solids" ? "stripes" : "solids";
  return state;
}

describe("RulesEngine", () => {
  it("keeps the breaker at the table after a legal break with a pocketed object ball", () => {
    const engine = new RulesEngine();
    const state = createInitialGameState();

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 1,
        pocketedBalls: [{ ball: 3, pocket: "tc" }],
        railContacts: []
      })
    );

    expect(decision.foul).toBe(false);
    expect(decision.continueTurn).toBe(true);
    expect(state.phase).toBe("open");
    expect(state.currentPlayer).toBe(0);
    expect(engine.getRemainingBalls().has(3)).toBe(false);
  });

  it("awards ball in hand to the opponent after an illegal break", () => {
    const engine = new RulesEngine();
    const state = createInitialGameState();

    const decision = engine.applyShot(
      state,
      shot({
        pocketedBalls: [],
        railContacts: [],
        breakStats: { objectBallsToRail: 3 }
      })
    );

    expect(decision.foul).toBe(true);
    expect(decision.ballInHand).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.ballInHand).toBe(true);
  });

  it("respots the eight when it drops on the break without ending the match", () => {
    const engine = new RulesEngine();
    const state = createInitialGameState();

    const decision = engine.applyShot(
      state,
      shot({
        pocketedBalls: [{ ball: 8, pocket: "br" }],
        railContacts: [],
        breakStats: { objectBallsToRail: 4 }
      })
    );

    expect(decision.winner).toBeNull();
    expect(decision.respotBalls).toContain(8);
    expect(engine.getRemainingBalls().has(8)).toBe(true);
  });

  it("assigns groups from the first legal open-table pocket", () => {
    const engine = new RulesEngine();
    const state = createInitialGameState();
    state.phase = "open";

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 10,
        pocketedBalls: [{ ball: 10, pocket: "tl" }]
      })
    );

    expect(decision.assignedGroup).toBe("stripes");
    expect(state.players[0].group).toBe("stripes");
    expect(state.players[1].group).toBe("solids");
    expect(state.phase).toBe("groups");
  });

  it("fouls for first hitting the wrong group", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 10,
        railContacts: [{ ball: 10, rail: "left" }]
      })
    );

    expect(decision.foul).toBe(true);
    expect(decision.foulReasons.join(" ")).toContain("非本组球");
    expect(state.currentPlayer).toBe(1);
    expect(state.ballInHand).toBe(true);
  });

  it("allows a player to continue after legally pocketing their own group", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 2,
        pocketedBalls: [{ ball: 2, pocket: "bc" }],
        railContacts: []
      })
    );

    expect(decision.foul).toBe(false);
    expect(decision.continueTurn).toBe(true);
    expect(state.currentPlayer).toBe(0);
    expect(state.players[0].score).toBe(1);
  });

  it("switches turns after only pocketing the opponent group from a legal hit", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 1,
        pocketedBalls: [{ ball: 12, pocket: "tc" }]
      })
    );

    expect(decision.foul).toBe(false);
    expect(decision.switchTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(engine.getRemainingBalls().has(12)).toBe(false);
  });

  it("wins on a called eight after the group is cleared", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");
    state.phase = "eight";
    engine.replaceRemainingBalls([8, 9, 10, 11, 12, 13, 14, 15]);

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 8,
        pocketedBalls: [{ ball: 8, pocket: "tr" }],
        railContacts: []
      }),
      "tr"
    );

    expect(decision.winner).toBe(0);
    expect(state.phase).toBe("ended");
  });

  it("loses when the eight is pocketed into a different pocket than called", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");
    state.phase = "eight";
    engine.replaceRemainingBalls([8, 9, 10, 11, 12, 13, 14, 15]);

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 8,
        pocketedBalls: [{ ball: 8, pocket: "tl" }]
      }),
      "br" as PocketId
    );

    expect(decision.foul).toBe(true);
    expect(decision.winner).toBe(1);
    expect(state.lossReason).toBe("wrong-pocket-eight");
  });

  it("loses when the eight is pocketed before the player clears their group", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 1,
        pocketedBalls: [{ ball: 8, pocket: "bc" }]
      })
    );

    expect(decision.foul).toBe(true);
    expect(decision.winner).toBe(1);
    expect(state.lossReason).toBe("early-eight");
  });

  it("loses when the eight leaves the table", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 1,
        offTableBalls: [8]
      })
    );

    expect(decision.foul).toBe(true);
    expect(decision.winner).toBe(1);
    expect(state.lossReason).toBe("eight-off-table");
  });

  it("returns to group play when a player on the eight misses and the opponent still has balls", () => {
    const engine = new RulesEngine();
    const state = groupedState("solids");
    state.phase = "eight";
    engine.replaceRemainingBalls([8, 9, 10]);

    const decision = engine.applyShot(
      state,
      shot({
        firstContactBall: 8,
        pocketedBalls: [],
        railContacts: [{ ball: 8, rail: "top" }]
      })
    );

    expect(decision.switchTurn).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.phase).toBe("groups");
  });
});
