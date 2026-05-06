export type BallGroup = "solids" | "stripes";

export type GamePhase = "break" | "open" | "groups" | "eight" | "ended";

export type PocketId = "tl" | "tc" | "tr" | "bl" | "bc" | "br";

export type LossReason =
  | "early-eight"
  | "wrong-pocket-eight"
  | "eight-off-table"
  | "eight-with-cue-foul";

export interface PlayerState {
  id: 0 | 1;
  name: string;
  group: BallGroup | null;
  score: number;
  fouls: number;
  visits: number;
}

export interface GameState {
  phase: GamePhase;
  currentPlayer: 0 | 1;
  players: [PlayerState, PlayerState];
  ballInHand: boolean;
  winner: 0 | 1 | null;
  lossReason: LossReason | null;
  shotNumber: number;
}

export interface RailContact {
  ball: number;
  rail: "left" | "right" | "top" | "bottom";
}

export interface PocketedBall {
  ball: number;
  pocket: PocketId;
}

export interface BreakStats {
  objectBallsToRail: number;
}

export interface ShotResult {
  firstContactBall: number | null;
  pocketedBalls: PocketedBall[];
  railContacts: RailContact[];
  offTableBalls: number[];
  cueBallPocketed: boolean;
  breakStats: BreakStats;
}

export interface RuleDecision {
  foul: boolean;
  foulReasons: string[];
  switchTurn: boolean;
  continueTurn: boolean;
  ballInHand: boolean;
  winner: 0 | 1 | null;
  message: string;
  assignedGroup?: BallGroup;
  respotBalls: number[];
}

export interface StrokeVars {
  aimAngle: number;
  power: number;
  spinX: number;
  spinY: number;
  elevation: number;
}

export type ControlMode = "stand" | "crouch" | "aim" | "placeBall" | "shotAnimating";
