import { createElement, Crosshair, Hand, RotateCcw } from "lucide";
import { BilliardsScene } from "../game/scene";
import { ControlsController } from "../game/controls";
import { BilliardsPhysics } from "../game/physics";
import { createInitialGameState, RulesEngine } from "../game/rules";
import { isValidCuePlacement, type Vec2 } from "../game/geometry";
import type { GameState, PocketId, RuleDecision, ShotResult } from "../game/types";

export class EightBallApp {
  private readonly root: HTMLDivElement;
  private readonly controls = new ControlsController();
  private readonly rules = new RulesEngine();
  private state: GameState = createInitialGameState();
  private physics: BilliardsPhysics | null = null;
  private view: BilliardsScene | null = null;
  private calledPocket: PocketId | undefined;
  private message = "PLAYER 1 开球。";
  private pointerDown = false;
  private aimPointerActive = false;
  private freeAimPointerReady = false;
  private controlDrag: "power" | "elevation" | "spin" | null = null;
  private lastPointer = { x: 0, y: 0 };
  private readonly heldViewKeys = new Set<string>();
  private readonly keyDownAt = new Map<string, number>();
  private lastFrameAt = performance.now();
  private placementPoint: Vec2 | null = null;
  private dom!: DomRefs;

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  async launch(): Promise<void> {
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

  private bindEvents(): void {
    window.addEventListener("resize", () => this.view?.resize());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", () => {
      this.heldViewKeys.clear();
      this.keyDownAt.clear();
    });
    this.dom.shell.addEventListener("wheel", this.onWheel, { passive: false });
    this.dom.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.dom.canvas.addEventListener("pointermove", this.onPointerMove);
    this.dom.canvas.addEventListener("pointerup", this.onPointerUp);
    this.dom.canvas.addEventListener("pointerleave", this.onPointerUp);
    this.dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.dom.powerMeter.addEventListener("pointerdown", (event) => this.onMeterPointer(event, "power"));
    this.dom.elevationMeter.addEventListener("pointerdown", (event) => this.onMeterPointer(event, "elevation"));
    this.dom.spinPad.addEventListener("pointerdown", this.onSpinPointerDown);
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
    this.dom.resetButton.addEventListener("click", () => this.resetMatch());
    this.dom.aimButton.addEventListener("click", () => this.enterAim());
    this.dom.placeButton.addEventListener("click", () => this.enterPlaceBall());
    for (const button of this.dom.pocketButtons) {
      button.addEventListener("click", () => {
        this.calledPocket = button.dataset.pocket as PocketId;
        this.message = `黑八报袋：${button.dataset.pocketName}`;
        this.updateHud();
      });
    }
  }

  private frame(): void {
    this.applyHeldViewKeys();
    const physics = this.requirePhysics();
    const view = this.requireView();
    const shotResult = physics.step();
    if (shotResult) this.onShotComplete(shotResult);
    this.syncView();
    const balls = physics.getBallSnapshots();
    const cue = physics.getCueBall();
    view.updateCamera(this.controls, cue);
    view.updateAimVisuals(this.controls, balls);
    if (this.controls.mode === "placeBall") {
      const valid = this.placementPoint ? physics.isCuePlacementValid(this.placementPoint) : false;
      view.showPlacementMarker(this.placementPoint, valid);
    } else {
      view.showPlacementMarker(null, false);
    }
  }

  private onShotComplete(result: ShotResult): void {
    const decision = this.rules.applyShot(this.state, result, this.calledPocket);
    this.applyDecisionToPhysics(decision, result);
    this.message = decision.message;
    this.calledPocket = undefined;

    if (this.state.phase === "ended") {
      this.controls.readyAfterShot();
    } else if (this.state.ballInHand) {
      this.controls.placeBall();
      this.placementPoint = this.defaultCuePlacement();
      this.message = `${decision.message} PLAYER ${this.state.currentPlayer + 1} 自由球。`;
    } else {
      this.controls.readyAfterShot();
      this.placementPoint = null;
    }
    this.updateHud();
  }

  private applyDecisionToPhysics(decision: RuleDecision, result: ShotResult): void {
    const physics = this.requirePhysics();
    for (const ball of decision.respotBalls) physics.respotBall(ball);
    if (this.state.ballInHand) {
      physics.respotBall(0, this.defaultCuePlacement());
    } else if (result.cueBallPocketed || result.offTableBalls.includes(0)) {
      physics.respotBall(0);
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    if (this.controls.mode === "shotAnimating") {
      event.preventDefault();
      return;
    }

    if (isViewMoveKey(event.code) && isObservationMode(this.controls.mode)) {
      event.preventDefault();
      this.heldViewKeys.add(event.code);
      if (!event.repeat) this.keyDownAt.set(event.code, performance.now());
      this.moveViewForKey(event.code, 0.075);
      return;
    }

    if (this.controls.mode === "aim" && isAimNudgeKey(event.code)) {
      event.preventDefault();
      this.nudgeAimForKey(event.code, event.shiftKey ? 4.5 : 1);
      return;
    }

    if (this.controls.mode === "aim" && isPowerNudgeKey(event.code)) {
      event.preventDefault();
      this.nudgePowerForKey(event.code, event.shiftKey ? 0.08 : 0.025);
      return;
    }

    switch (event.code) {
      case "KeyW":
        event.preventDefault();
        this.enterAim();
        break;
      case "KeyS":
        event.preventDefault();
        this.controls.stand();
        this.updateHud();
        break;
      case "KeyX":
        event.preventDefault();
        this.controls.toggleCrouch();
        this.updateHud();
        break;
      case "KeyP":
        event.preventDefault();
        this.enterPlaceBall();
        break;
      case "Space":
        event.preventDefault();
        this.shoot();
        break;
      case "KeyC":
        event.preventDefault();
        this.controls.clearSpin();
        this.updateHud();
        break;
      case "Escape":
        event.preventDefault();
        this.heldViewKeys.clear();
        this.keyDownAt.clear();
        this.controls.stand();
        this.updateHud();
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!isViewMoveKey(event.code)) return;
    const downAt = this.keyDownAt.get(event.code);
    const duration = downAt ? performance.now() - downAt : Number.POSITIVE_INFINITY;
    this.heldViewKeys.delete(event.code);
    this.keyDownAt.delete(event.code);
    if (duration > 180 || this.controls.mode === "shotAnimating" || this.controls.mode === "placeBall") return;

    if (event.code === "KeyW") {
      this.enterAim();
    } else if (event.code === "KeyS") {
      this.controls.stand();
      this.updateHud();
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.controls.mode !== "aim") return;
    event.preventDefault();
    if (event.altKey || event.metaKey) {
      this.controls.setElevationFromWheel(event.deltaY);
    } else {
      this.controls.setPowerFromWheel(event.deltaY);
    }
    this.updateHud();
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDown = true;
    this.aimPointerActive = this.controls.mode === "aim";
    this.freeAimPointerReady = this.controls.mode === "aim";
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.dom.canvas.setPointerCapture(event.pointerId);
    if (this.controls.mode === "placeBall") {
      this.tryPlaceCueAtPointer(event.clientX, event.clientY);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.controls.mode === "placeBall") {
      this.placementPoint = this.requireView().pickTablePoint(event.clientX, event.clientY);
      this.updateHud();
      return;
    }

    const freeAim = this.controls.mode === "aim" && !this.pointerDown;
    if (freeAim && !this.freeAimPointerReady) {
      this.freeAimPointerReady = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!this.pointerDown && !freeAim && !(this.controls.mode === "aim" && this.aimPointerActive)) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer = { x: event.clientX, y: event.clientY };

    if (this.controls.mode === "aim") {
      if (event.altKey || event.metaKey) this.controls.addSpinDelta(dx, dy);
      else this.controls.addAimDelta(dx);
    } else {
      this.controls.addOrbitDelta(dx);
    }
    this.updateHud();
  };

  private onPointerUp = (): void => {
    this.pointerDown = false;
    this.aimPointerActive = false;
  };

  private onMeterPointer(event: PointerEvent, meter: "power" | "elevation"): void {
    if (!this.canAdjustStroke()) return;
    event.preventDefault();
    this.controlDrag = meter;
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
    this.setMeterFromPointer(meter, event.clientY);
  }

  private onSpinPointerDown = (event: PointerEvent): void => {
    if (!this.canAdjustStroke()) return;
    event.preventDefault();
    this.controlDrag = "spin";
    this.dom.spinPad.setPointerCapture(event.pointerId);
    this.setSpinFromPointer(event.clientX, event.clientY);
  };

  private onWindowPointerMove = (event: PointerEvent): void => {
    if (this.controlDrag === "power" || this.controlDrag === "elevation") {
      event.preventDefault();
      this.setMeterFromPointer(this.controlDrag, event.clientY);
    } else if (this.controlDrag === "spin") {
      event.preventDefault();
      this.setSpinFromPointer(event.clientX, event.clientY);
    }
  };

  private onWindowPointerUp = (): void => {
    this.controlDrag = null;
  };

  private applyHeldViewKeys(): void {
    const now = performance.now();
    const dt = (now - this.lastFrameAt) / 1000;
    this.lastFrameAt = now;

    if (this.heldViewKeys.size === 0) return;
    let forward = 0;
    let strafe = 0;
    if (this.heldViewKeys.has("KeyW")) forward += 1;
    if (this.heldViewKeys.has("KeyS")) forward -= 1;
    if (this.heldViewKeys.has("KeyA")) strafe -= 1;
    if (this.heldViewKeys.has("KeyD")) strafe += 1;

    if (this.controls.moveView(forward, strafe, dt)) {
      this.message = `PLAYER ${this.state.currentPlayer + 1} 观察中。`;
      this.updateHud();
    }
  }

  private moveViewForKey(code: string, dt: number): void {
    const direction = viewMoveDirection(code);
    if (!direction) return;
    if (this.controls.moveView(direction.forward, direction.strafe, dt)) {
      this.message = `PLAYER ${this.state.currentPlayer + 1} 观察中。`;
      this.updateHud();
    }
  }

  private nudgeAimForKey(code: string, multiplier: number): void {
    const direction = code === "KeyA" || code === "ArrowLeft" ? -1 : 1;
    this.controls.addAimDelta(direction * 10 * multiplier);
    this.message = `PLAYER ${this.state.currentPlayer + 1} 瞄准中。`;
    this.updateHud();
  }

  private nudgePowerForKey(code: string, amount: number): void {
    const direction = code === "ArrowUp" ? 1 : -1;
    this.controls.setPower(this.controls.stroke.power + direction * amount);
    this.message = `力度 ${Math.round(this.controls.stroke.power * 100)}%。`;
    this.updateHud();
  }

  private setMeterFromPointer(meter: "power" | "elevation", clientY: number): void {
    const element = meter === "power" ? this.dom.powerMeter : this.dom.elevationMeter;
    const rect = element.getBoundingClientRect();
    const value = clamp01((rect.bottom - clientY) / rect.height);
    if (meter === "power") {
      this.controls.setPower(value);
      this.message = `力度 ${Math.round(this.controls.stroke.power * 100)}%。`;
    } else {
      this.controls.setElevation(value * 0.52);
      this.message = `杆尾高度 ${Math.round((this.controls.stroke.elevation / 0.52) * 100)}%。`;
    }
    this.updateHud();
  }

  private setSpinFromPointer(clientX: number, clientY: number): void {
    const rect = this.dom.spinPad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2 - 8;
    this.controls.setSpin((clientX - centerX) / radius, -(clientY - centerY) / radius);
    this.message = `杆法 X ${this.controls.stroke.spinX.toFixed(2)} / Y ${this.controls.stroke.spinY.toFixed(2)}。`;
    this.updateHud();
  }

  private enterAim(): void {
    if (!this.canInteract()) return;
    if (this.state.ballInHand) {
      this.enterPlaceBall();
      return;
    }
    this.controls.enterAim(this.controls.stroke.aimAngle);
    this.freeAimPointerReady = false;
    this.message = `PLAYER ${this.state.currentPlayer + 1} 瞄准中。`;
    this.updateHud();
  }

  private canAdjustStroke(): boolean {
    if (!this.canInteract()) return false;
    if (this.controls.mode !== "aim") this.enterAim();
    return this.controls.mode === "aim";
  }

  private enterPlaceBall(): void {
    if (!this.canInteract()) return;
    if (!this.state.ballInHand) {
      this.message = "当前没有自由球。";
      this.updateHud();
      return;
    }
    this.controls.placeBall();
    this.placementPoint = this.defaultCuePlacement();
    this.updateHud();
  }

  private shoot(): void {
    if (!this.canInteract()) return;
    if (this.controls.mode !== "aim") {
      this.enterAim();
      return;
    }
    if (this.state.phase === "eight" && !this.calledPocket) {
      this.message = "黑八阶段需要先报袋。";
      this.updateHud();
      return;
    }
    this.requirePhysics().shoot(this.controls.stroke);
    this.state.ballInHand = false;
    this.controls.shotAnimating();
    this.message = "击球中。";
    this.updateHud();
  }

  private tryPlaceCueAtPointer(clientX: number, clientY: number): void {
    const point = this.requireView().pickTablePoint(clientX, clientY);
    if (!point) return;
    this.placementPoint = point;
    const physics = this.requirePhysics();
    if (!physics.placeCueBall(point)) {
      this.message = "该位置不可摆放母球。";
      this.updateHud();
      return;
    }
    this.state.ballInHand = false;
    this.controls.stand();
    this.message = "母球已摆放。";
    this.updateHud();
  }

  private resetMatch(): void {
    this.rules.reset();
    this.state = createInitialGameState();
    this.calledPocket = undefined;
    this.message = "PLAYER 1 开球。";
    this.controls.stand();
    this.physics?.reset();
    this.syncView();
    this.updateHud();
  }

  private canInteract(): boolean {
    return this.state.phase !== "ended" && !this.requirePhysics().isMoving() && this.controls.mode !== "shotAnimating";
  }

  private defaultCuePlacement(): Vec2 {
    const physics = this.requirePhysics();
    const candidates: Vec2[] = [
      { x: -1.15, z: 0 },
      { x: -0.65, z: 0.28 },
      { x: -0.65, z: -0.28 },
      { x: 0, z: 0 },
      { x: 0.4, z: 0.32 },
      { x: 0.4, z: -0.32 }
    ];
    const balls = physics.getBallSnapshots();
    return candidates.find((point) => isValidCuePlacement(point, balls)) ?? { x: -1.15, z: 0 };
  }

  private syncView(): void {
    const physics = this.requirePhysics();
    this.requireView().syncBalls(physics.getBallSnapshots());
  }

  private updateHud(): void {
    const current = this.state.currentPlayer;
    this.dom.playerPanels[0].classList.toggle("active", current === 0);
    this.dom.playerPanels[1].classList.toggle("active", current === 1);
    for (const player of this.state.players) {
      const panel = this.dom.playerPanels[player.id];
      panel.querySelector<HTMLElement>(".score")!.textContent = String(player.score);
      panel.querySelector<HTMLElement>(".group")!.textContent = player.group ? groupLabel(player.group) : "OPEN";
      panel.querySelector<HTMLElement>(".fouls")!.textContent = String(player.fouls);
    }

    this.dom.phase.textContent = phaseLabel(this.state.phase);
    this.dom.mode.textContent = modeLabel(this.controls.mode);
    this.dom.message.textContent = this.state.phase === "ended" && this.state.winner !== null
      ? `PLAYER ${this.state.winner + 1} 获胜`
      : this.message;

    this.dom.powerFill.style.height = `${Math.round(this.controls.stroke.power * 100)}%`;
    this.dom.elevationFill.style.height = `${Math.round(this.controls.stroke.elevation * 100)}%`;
    this.dom.spinThumb.style.transform = `translate(${this.controls.stroke.spinX * 34}px, ${-this.controls.stroke.spinY * 34}px)`;
    this.dom.placeButton.classList.toggle("enabled", this.state.ballInHand);

    const showPocketCall = this.state.phase === "eight";
    this.dom.pocketPanel.hidden = !showPocketCall;
    for (const button of this.dom.pocketButtons) {
      button.classList.toggle("selected", button.dataset.pocket === this.calledPocket);
    }
  }

  private requirePhysics(): BilliardsPhysics {
    if (!this.physics) throw new Error("Physics is not ready.");
    return this.physics;
  }

  private requireView(): BilliardsScene {
    if (!this.view) throw new Error("Scene is not ready.");
    return this.view;
  }
}

interface DomRefs {
  shell: HTMLElement;
  canvas: HTMLCanvasElement;
  playerPanels: [HTMLElement, HTMLElement];
  phase: HTMLElement;
  mode: HTMLElement;
  message: HTMLElement;
  powerFill: HTMLElement;
  elevationFill: HTMLElement;
  spinThumb: HTMLElement;
  powerMeter: HTMLElement;
  elevationMeter: HTMLElement;
  spinPad: HTMLElement;
  resetButton: HTMLButtonElement;
  aimButton: HTMLButtonElement;
  placeButton: HTMLButtonElement;
  pocketPanel: HTMLElement;
  pocketButtons: HTMLButtonElement[];
}

function renderShell(): string {
  return `
    <main class="game-shell">
      <canvas class="game-canvas"></canvas>
      <section class="scorebar">
        <article class="player-card active" data-player="0">
          <div class="name">PLAYER 1</div>
          <div class="score">0</div>
          <div class="meta"><span class="group">OPEN</span><span>F <b class="fouls">0</b></span></div>
        </article>
        <div class="match-state">
          <div class="phase">BREAK</div>
          <div class="mode">STAND</div>
        </div>
        <article class="player-card" data-player="1">
          <div class="name">PLAYER 2</div>
          <div class="score">0</div>
          <div class="meta"><span class="group">OPEN</span><span>F <b class="fouls">0</b></span></div>
        </article>
      </section>
      <section class="status-line"></section>
      <section class="tool-panel">
        <button class="icon-button aim-button" title="Aim"></button>
        <button class="icon-button place-button" title="Place cue ball"></button>
        <button class="icon-button reset-button" title="Restart"></button>
        <div class="spin-pad" title="Cue spin"><i></i></div>
        <div class="meter power-meter" title="Power"><span></span></div>
        <div class="meter elevation-meter" title="Cue elevation"><span></span></div>
      </section>
      <section class="pocket-call" hidden>
        <button data-pocket="tl" data-pocket-name="左上袋"></button>
        <button data-pocket="tc" data-pocket-name="中上袋"></button>
        <button data-pocket="tr" data-pocket-name="右上袋"></button>
        <button data-pocket="bl" data-pocket-name="左下袋"></button>
        <button data-pocket="bc" data-pocket-name="中下袋"></button>
        <button data-pocket="br" data-pocket-name="右下袋"></button>
      </section>
    </main>
  `;
}

function collectDomRefs(root: HTMLDivElement): DomRefs {
  const playerPanels = [...root.querySelectorAll<HTMLElement>(".player-card")];
  return {
    shell: root.querySelector<HTMLElement>(".game-shell")!,
    canvas: root.querySelector<HTMLCanvasElement>(".game-canvas")!,
    playerPanels: [playerPanels[0], playerPanels[1]],
    phase: root.querySelector<HTMLElement>(".phase")!,
    mode: root.querySelector<HTMLElement>(".mode")!,
    message: root.querySelector<HTMLElement>(".status-line")!,
    powerFill: root.querySelector<HTMLElement>(".power-meter span")!,
    elevationFill: root.querySelector<HTMLElement>(".elevation-meter span")!,
    spinThumb: root.querySelector<HTMLElement>(".spin-pad i")!,
    powerMeter: root.querySelector<HTMLElement>(".power-meter")!,
    elevationMeter: root.querySelector<HTMLElement>(".elevation-meter")!,
    spinPad: root.querySelector<HTMLElement>(".spin-pad")!,
    resetButton: root.querySelector<HTMLButtonElement>(".reset-button")!,
    aimButton: root.querySelector<HTMLButtonElement>(".aim-button")!,
    placeButton: root.querySelector<HTMLButtonElement>(".place-button")!,
    pocketPanel: root.querySelector<HTMLElement>(".pocket-call")!,
    pocketButtons: [...root.querySelectorAll<HTMLButtonElement>(".pocket-call button")]
  };
}

function installIcon(button: HTMLButtonElement, icon: Parameters<typeof createElement>[0]): void {
  const svg = createElement(icon);
  svg.setAttribute("width", "19");
  svg.setAttribute("height", "19");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("aria-hidden", "true");
  button.replaceChildren(svg);
}

function isUnsupportedMobile(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 1;
}

function isViewMoveKey(code: string): boolean {
  return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
}

function isAimNudgeKey(code: string): boolean {
  return code === "KeyA" || code === "KeyD" || code === "ArrowLeft" || code === "ArrowRight";
}

function isPowerNudgeKey(code: string): boolean {
  return code === "ArrowUp" || code === "ArrowDown";
}

function isObservationMode(mode: string): boolean {
  return mode === "stand" || mode === "crouch";
}

function viewMoveDirection(code: string): { forward: number; strafe: number } | null {
  switch (code) {
    case "KeyW":
      return { forward: 1, strafe: 0 };
    case "KeyS":
      return { forward: -1, strafe: 0 };
    case "KeyA":
      return { forward: 0, strafe: -1 };
    case "KeyD":
      return { forward: 0, strafe: 1 };
    default:
      return null;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function groupLabel(group: string): string {
  return group === "solids" ? "1-7" : "9-15";
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "break":
      return "BREAK";
    case "open":
      return "OPEN";
    case "groups":
      return "GROUPS";
    case "eight":
      return "EIGHT";
    case "ended":
      return "ENDED";
    default:
      return phase.toUpperCase();
  }
}

function modeLabel(mode: string): string {
  switch (mode) {
    case "stand":
      return "STAND";
    case "crouch":
      return "LOW";
    case "aim":
      return "AIM";
    case "placeBall":
      return "PLACE";
    case "shotAnimating":
      return "SHOT";
    default:
      return mode.toUpperCase();
  }
}
