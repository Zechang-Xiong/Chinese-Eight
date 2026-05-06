import type {
  BallGroup,
  GameState,
  PocketId,
  RuleDecision,
  ShotResult
} from "./types";

const SOLIDS = new Set([1, 2, 3, 4, 5, 6, 7]);
const STRIPES = new Set([9, 10, 11, 12, 13, 14, 15]);
const EIGHT = 8;

export function createInitialGameState(): GameState {
  return {
    phase: "break",
    currentPlayer: 0,
    players: [
      { id: 0, name: "PLAYER 1", group: null, score: 0, fouls: 0, visits: 0 },
      { id: 1, name: "PLAYER 2", group: null, score: 0, fouls: 0, visits: 0 }
    ],
    ballInHand: false,
    winner: null,
    lossReason: null,
    shotNumber: 0
  };
}

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    players: [
      { ...state.players[0] },
      { ...state.players[1] }
    ]
  };
}

export function groupForBall(ball: number): BallGroup | null {
  if (SOLIDS.has(ball)) return "solids";
  if (STRIPES.has(ball)) return "stripes";
  return null;
}

export function oppositeGroup(group: BallGroup): BallGroup {
  return group === "solids" ? "stripes" : "solids";
}

export function ballsForGroup(group: BallGroup): number[] {
  return group === "solids" ? [...SOLIDS] : [...STRIPES];
}

export function isObjectBall(ball: number): boolean {
  return ball > 0 && ball <= 15;
}

export class RulesEngine {
  private readonly remainingBalls: Set<number>;

  constructor() {
    this.remainingBalls = new Set(Array.from({ length: 15 }, (_, index) => index + 1));
  }

  reset(): void {
    this.remainingBalls.clear();
    for (let ball = 1; ball <= 15; ball += 1) this.remainingBalls.add(ball);
  }

  getRemainingBalls(): Set<number> {
    return new Set(this.remainingBalls);
  }

  replaceRemainingBalls(balls: number[]): void {
    this.remainingBalls.clear();
    for (const ball of balls) {
      if (ball > 0 && ball <= 15) this.remainingBalls.add(ball);
    }
  }

  applyShot(state: GameState, result: ShotResult, calledPocket?: PocketId): RuleDecision {
    if (state.phase === "ended") {
      return this.makeDecision(false, [], false, false, state.ballInHand, null, "对局已结束。", []);
    }

    const player = state.players[state.currentPlayer];
    player.visits += 1;
    state.shotNumber += 1;

    const pocketed = result.pocketedBalls.map((item) => item.ball);
    const objectPocketed = pocketed.filter((ball) => ball !== 0);
    const eightPocket = result.pocketedBalls.find((item) => item.ball === EIGHT);
    const offTableObjectBalls = result.offTableBalls.filter((ball) => ball !== 0);
    const foulReasons: string[] = [];
    const respotBalls: number[] = [];

    if (result.cueBallPocketed || pocketed.includes(0)) {
      foulReasons.push("母球进袋");
    }
    if (result.offTableBalls.includes(0)) {
      foulReasons.push("母球离台");
    }
    if (offTableObjectBalls.length > 0) {
      foulReasons.push("目标球离台");
    }

    if (result.offTableBalls.includes(EIGHT)) {
      state.phase = "ended";
      state.winner = this.otherPlayer(state.currentPlayer);
      state.lossReason = "eight-off-table";
      player.fouls += 1;
      return this.makeDecision(
        true,
        [...foulReasons, "黑八离台"],
        false,
        false,
        false,
        state.winner,
        "黑八离台，对手获胜。",
        respotBalls
      );
    }

    if (state.phase === "break") {
      return this.applyBreakShot(state, result, foulReasons, respotBalls);
    }

    const currentTarget = this.getCurrentTargetGroup(state);
    const firstContactGroup = result.firstContactBall === null ? null : groupForBall(result.firstContactBall);
    if (result.firstContactBall === null) {
      foulReasons.push("未碰到目标球");
    } else if (currentTarget === "eight") {
      if (result.firstContactBall !== EIGHT) foulReasons.push("黑八阶段未先碰黑八");
    } else if (state.phase === "open") {
      if (result.firstContactBall === EIGHT) foulReasons.push("开台阶段先碰黑八");
    } else if (firstContactGroup !== currentTarget) {
      foulReasons.push("先碰到非本组球");
    }

    if (eightPocket) {
      const loss = this.evaluateEightBallPocket(state, result, calledPocket, eightPocket.pocket, foulReasons);
      if (loss) {
        state.phase = "ended";
        state.winner = this.otherPlayer(state.currentPlayer);
        state.lossReason = loss;
        player.fouls += 1;
        return this.makeDecision(
          true,
          foulReasons,
          false,
          false,
          false,
          state.winner,
          "黑八犯规，对手获胜。",
          respotBalls
        );
      }
      state.phase = "ended";
      state.winner = state.currentPlayer;
      return this.makeDecision(false, [], false, false, false, state.currentPlayer, "黑八入袋，获胜。", respotBalls);
    }

    const legalPocketed = this.legalPocketedForCurrentState(state, objectPocketed);
    const anyObjectOrRailAfterContact =
      objectPocketed.length > 0 || result.railContacts.some((contact) => isObjectBall(contact.ball));
    if (result.firstContactBall !== null && !anyObjectOrRailAfterContact) {
      foulReasons.push("击球后无进球且无目标球碰库");
    }

    const foul = foulReasons.length > 0;
    if (foul) {
      this.commitRemovedBalls([...objectPocketed, ...offTableObjectBalls], respotBalls);
      player.fouls += 1;
      return this.endVisitWithFoul(state, foulReasons, respotBalls);
    }

    let assignedGroup: BallGroup | undefined;
    if (state.phase === "open") {
      assignedGroup = this.assignGroupsFromPocketed(state, objectPocketed);
    }

    this.commitRemovedBalls([...objectPocketed, ...offTableObjectBalls], respotBalls);
    this.updateEightPhaseIfReady(state);

    if (legalPocketed.length > 0) {
      player.score += legalPocketed.length;
      state.ballInHand = false;
      return this.makeDecision(false, [], false, true, false, null, "合法进球，继续出杆。", respotBalls, assignedGroup);
    }

    this.switchTurn(state);
    return this.makeDecision(false, [], true, false, false, null, "未进本组球，交换出杆。", respotBalls, assignedGroup);
  }

  private applyBreakShot(
    state: GameState,
    result: ShotResult,
    foulReasons: string[],
    respotBalls: number[]
  ): RuleDecision {
    const pocketed = result.pocketedBalls.map((item) => item.ball);
    const objectPocketed = pocketed.filter((ball) => ball !== 0);
    const eightWasPocketed = objectPocketed.includes(EIGHT);
    const legalObjectPocket = objectPocketed.some((ball) => ball !== EIGHT);
    const breakMadeObject = legalObjectPocket || eightWasPocketed;
    const legalBreakSpread = result.breakStats.objectBallsToRail >= 4;

    if (!breakMadeObject && !legalBreakSpread) {
      foulReasons.push("开球未进球且少于四颗目标球碰库");
    }

    if (eightWasPocketed) {
      respotBalls.push(EIGHT);
    }

    const foul = foulReasons.length > 0;
    const breakRemovedBalls = [
      ...objectPocketed.filter((ball) => ball !== EIGHT),
      ...result.offTableBalls.filter((ball) => ball > 0 && ball !== EIGHT)
    ];
    this.commitRemovedBalls(breakRemovedBalls, respotBalls);

    state.phase = "open";
    if (foul) {
      state.players[state.currentPlayer].fouls += 1;
      return this.endVisitWithFoul(state, foulReasons, respotBalls, "开球犯规，对手自由球。");
    }

    state.ballInHand = false;
    if (legalObjectPocket) {
      return this.makeDecision(false, [], false, true, false, null, "有效开球，继续出杆。", respotBalls);
    }

    this.switchTurn(state);
    return this.makeDecision(false, [], true, false, false, null, "有效开球，交换出杆。", respotBalls);
  }

  private evaluateEightBallPocket(
    state: GameState,
    result: ShotResult,
    calledPocket: PocketId | undefined,
    actualPocket: PocketId,
    foulReasons: string[]
  ) {
    const playerGroup = state.players[state.currentPlayer].group;
    const hasCueFoul = result.cueBallPocketed || result.offTableBalls.includes(0);
    const hasWrongFirstContact = state.phase !== "eight" || result.firstContactBall !== EIGHT;

    if (state.phase !== "eight" || !playerGroup || !this.groupCleared(playerGroup)) {
      foulReasons.push("未清台打进黑八");
      return "early-eight" as const;
    }
    if (hasCueFoul) {
      foulReasons.push("黑八入袋同时母球犯规");
      return "eight-with-cue-foul" as const;
    }
    if (result.offTableBalls.includes(EIGHT)) {
      foulReasons.push("黑八离台");
      return "eight-off-table" as const;
    }
    if (hasWrongFirstContact) {
      foulReasons.push("黑八阶段未先碰黑八");
      return "early-eight" as const;
    }
    if (!calledPocket || calledPocket !== actualPocket) {
      foulReasons.push("黑八未进入报定袋");
      return "wrong-pocket-eight" as const;
    }
    return null;
  }

  private legalPocketedForCurrentState(state: GameState, pocketed: number[]): number[] {
    if (state.phase === "open") {
      return pocketed.filter((ball) => groupForBall(ball) !== null);
    }

    const target = this.getCurrentTargetGroup(state);
    if (target === "eight") return pocketed.filter((ball) => ball === EIGHT);
    return pocketed.filter((ball) => groupForBall(ball) === target);
  }

  private assignGroupsFromPocketed(state: GameState, pocketed: number[]): BallGroup | undefined {
    const firstGroup = pocketed.map(groupForBall).find((group): group is BallGroup => group !== null);
    if (!firstGroup) return undefined;

    state.players[state.currentPlayer].group = firstGroup;
    state.players[this.otherPlayer(state.currentPlayer)].group = oppositeGroup(firstGroup);
    state.phase = "groups";
    return firstGroup;
  }

  private commitRemovedBalls(removedBalls: number[], respotBalls: number[]): void {
    for (const ball of removedBalls) {
      if (ball === 0 || respotBalls.includes(ball)) continue;
      this.remainingBalls.delete(ball);
    }
  }

  private updateEightPhaseIfReady(state: GameState): void {
    if (state.phase === "ended") return;
    const group = state.players[state.currentPlayer].group;
    if (group && this.groupCleared(group)) state.phase = "eight";
  }

  private groupCleared(group: BallGroup): boolean {
    return ballsForGroup(group).every((ball) => !this.remainingBalls.has(ball));
  }

  private getCurrentTargetGroup(state: GameState): BallGroup | "eight" | null {
    if (state.phase === "eight") return "eight";
    if (state.phase === "groups") return state.players[state.currentPlayer].group;
    return null;
  }

  private endVisitWithFoul(
    state: GameState,
    foulReasons: string[],
    respotBalls: number[],
    message = "犯规，对手自由球。"
  ): RuleDecision {
    this.switchTurn(state);
    state.ballInHand = true;
    return this.makeDecision(true, foulReasons, true, false, true, null, message, respotBalls);
  }

  private switchTurn(state: GameState): void {
    state.currentPlayer = this.otherPlayer(state.currentPlayer);
    this.syncPhaseForCurrentPlayer(state);
  }

  private otherPlayer(player: 0 | 1): 0 | 1 {
    return player === 0 ? 1 : 0;
  }

  private syncPhaseForCurrentPlayer(state: GameState): void {
    if (state.phase === "break" || state.phase === "open" || state.phase === "ended") return;
    const group = state.players[state.currentPlayer].group;
    if (!group) return;
    state.phase = this.groupCleared(group) ? "eight" : "groups";
  }

  private makeDecision(
    foul: boolean,
    foulReasons: string[],
    switchTurn: boolean,
    continueTurn: boolean,
    ballInHand: boolean,
    winner: 0 | 1 | null,
    message: string,
    respotBalls: number[],
    assignedGroup?: BallGroup
  ): RuleDecision {
    return {
      foul,
      foulReasons,
      switchTurn,
      continueTurn,
      ballInHand,
      winner,
      message,
      assignedGroup,
      respotBalls: [...new Set(respotBalls)]
    };
  }
}
