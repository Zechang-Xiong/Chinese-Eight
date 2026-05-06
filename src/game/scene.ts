import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  LinesMesh,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import "@babylonjs/core/Materials/Textures/Loaders";
import { BALL_COLORS, createCushionSegments, HALF_LENGTH, HALF_WIDTH, POCKETS, TABLE } from "./constants";
import { computePrediction, type BallSnapshot, type PredictionRoute, type Vec2 } from "./geometry";
import type { ControlsController } from "./controls";

interface BallNode {
  root: TransformNode;
  number: number;
}

export class BilliardsScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  private readonly camera: ArcRotateCamera;
  private readonly tableMesh: Mesh;
  private readonly ballNodes = new Map<number, BallNode>();
  private readonly materials: Record<string, StandardMaterial | PBRMaterial> = {};
  private cueLine: Mesh | null = null;
  private cuePath: LinesMesh | null = null;
  private objectPath: LinesMesh | null = null;
  private placementMarker: Mesh;
  private lastPrediction: PredictionRoute | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.018, 0.022, 0.024, 1);
    this.camera = new ArcRotateCamera("camera", -Math.PI * 0.7, 1.05, 3.6, Vector3.Zero(), this.scene);
    this.camera.minZ = 0.02;
    this.camera.maxZ = 80;
    this.camera.fov = 0.78;
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;

    this.createMaterials();
    this.createLights();
    this.tableMesh = this.createTable();
    this.placementMarker = this.createPlacementMarker();
    const glow = new GlowLayer("glow", this.scene, { blurKernelSize: 32 });
    glow.intensity = 0.22;
  }

  run(onFrame: () => void): void {
    this.engine.runRenderLoop(() => {
      onFrame();
      this.scene.render();
    });
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.engine.dispose();
  }

  syncBalls(balls: BallSnapshot[]): void {
    for (const ball of balls) {
      let node = this.ballNodes.get(ball.number);
      if (!node) {
        node = this.createBallNode(ball.number);
        this.ballNodes.set(ball.number, node);
      }
      node.root.setEnabled(ball.active);
      node.root.position.set(ball.x, TABLE.ballY, ball.z);
    }
  }

  updateCamera(controls: ControlsController, cue: BallSnapshot): void {
    const target = new Vector3(cue.x, TABLE.ballY + 0.06, cue.z);
    if (controls.mode === "aim") {
      this.camera.setTarget(target);
      this.camera.alpha = Math.PI / 2 - controls.aimCameraAngle;
      this.camera.beta = 1.37 - controls.stroke.elevation * 0.32;
      this.camera.radius = 0.9;
      return;
    }

    this.camera.setTarget(new Vector3(cue.x * 0.55 + controls.viewOffset.x, 0.04, cue.z * 0.55 + controls.viewOffset.z));
    this.camera.alpha = controls.orbitAngle;
    this.camera.beta = controls.mode === "crouch" ? 1.36 : 0.95;
    this.camera.radius = controls.mode === "crouch" ? 2.35 : 3.55;
  }

  updateAimVisuals(controls: ControlsController, balls: BallSnapshot[]): void {
    const cue = balls.find((ball) => ball.number === 0);
    if (!cue || !cue.active || controls.mode !== "aim") {
      this.setAimMeshesEnabled(false);
      return;
    }
    this.setAimMeshesEnabled(true);
    const direction = { x: Math.cos(controls.stroke.aimAngle), z: Math.sin(controls.stroke.aimAngle) };
    const tipGap = TABLE.ballRadius * (1.8 + controls.stroke.power * 2.4);
    const tip = new Vector3(cue.x - direction.x * (TABLE.ballRadius + tipGap), TABLE.ballY + 0.012, cue.z - direction.z * (TABLE.ballRadius + tipGap));
    const back = new Vector3(
      tip.x - direction.x * (0.9 + controls.stroke.power * 0.35),
      TABLE.ballY + 0.08 + controls.stroke.elevation * 0.35,
      tip.z - direction.z * (0.9 + controls.stroke.power * 0.35)
    );

    this.cueLine = MeshBuilder.CreateTube(
      "cue-stick",
      {
        path: [back, tip],
        radius: 0.018,
        tessellation: 10,
        updatable: true,
        instance: this.cueLine ?? undefined
      },
      this.scene
    );
    this.cueLine.material = this.materials.cue;

    this.lastPrediction = computePrediction(cue, controls.stroke.aimAngle, balls);
    this.syncPredictionLine(this.lastPrediction);
  }

  showPlacementMarker(point: Vec2 | null, valid: boolean): void {
    if (!point) {
      this.placementMarker.setEnabled(false);
      return;
    }
    this.placementMarker.setEnabled(true);
    this.placementMarker.position.set(point.x, 0.011, point.z);
    const mat = this.placementMarker.material as StandardMaterial;
    mat.diffuseColor = valid ? Color3.FromHexString("#7bf1a8") : Color3.FromHexString("#ff5a6b");
    mat.emissiveColor = mat.diffuseColor.scale(0.3);
  }

  pickTablePoint(clientX: number, clientY: number): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pick = this.scene.pick(x, y, (mesh) => mesh === this.tableMesh);
    if (!pick?.hit || !pick.pickedPoint) return null;
    return { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
  }

  private syncPredictionLine(prediction: PredictionRoute): void {
    const cuePoints = prediction.cuePath.map((point) => new Vector3(point.x, TABLE.ballY + 0.004, point.z));
    this.cuePath = MeshBuilder.CreateLines(
      "cue-path",
      { points: cuePoints, updatable: true, instance: this.cuePath ?? undefined },
      this.scene
    );
    this.cuePath.color = Color3.FromHexString("#f9f2bb");

    if (prediction.objectPath.length > 0) {
      const objectPoints = prediction.objectPath.map((point) => new Vector3(point.x, TABLE.ballY + 0.006, point.z));
      this.objectPath = MeshBuilder.CreateLines(
        "object-path",
        { points: objectPoints, updatable: true, instance: this.objectPath ?? undefined },
        this.scene
      );
      this.objectPath.color = Color3.FromHexString("#63d6ff");
      this.objectPath.setEnabled(true);
    } else {
      this.objectPath?.setEnabled(false);
    }
  }

  private setAimMeshesEnabled(enabled: boolean): void {
    this.cueLine?.setEnabled(enabled);
    this.cuePath?.setEnabled(enabled);
    this.objectPath?.setEnabled(enabled && Boolean(this.lastPrediction?.objectPath.length));
  }

  private createMaterials(): void {
    const felt = new PBRMaterial("felt", this.scene);
    felt.albedoColor = Color3.FromHexString("#075c3f");
    felt.roughness = 0.82;
    felt.metallic = 0;
    this.materials.felt = felt;

    const rail = new PBRMaterial("rail", this.scene);
    rail.albedoColor = Color3.FromHexString("#27322d");
    rail.roughness = 0.48;
    rail.metallic = 0.05;
    this.materials.rail = rail;

    const frame = new PBRMaterial("frame", this.scene);
    frame.albedoColor = Color3.FromHexString("#121514");
    frame.roughness = 0.38;
    frame.metallic = 0.12;
    this.materials.frame = frame;

    const pocket = new StandardMaterial("pocket", this.scene);
    pocket.diffuseColor = Color3.FromHexString("#020202");
    pocket.emissiveColor = Color3.FromHexString("#000000");
    this.materials.pocket = pocket;

    const cue = new StandardMaterial("cue", this.scene);
    cue.diffuseColor = Color3.FromHexString("#d8b17b");
    cue.specularColor = Color3.FromHexString("#f4dfb7");
    this.materials.cue = cue;

    const marker = new StandardMaterial("marker", this.scene);
    marker.alpha = 0.52;
    marker.diffuseColor = Color3.FromHexString("#7bf1a8");
    marker.emissiveColor = Color3.FromHexString("#245f3f");
    this.materials.marker = marker;
  }

  private createLights(): void {
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.55;
    hemi.groundColor = Color3.FromHexString("#0b0d0c");

    const key = new DirectionalLight("key", new Vector3(-0.25, -1, 0.42), this.scene);
    key.position = new Vector3(0, 4, -2);
    key.intensity = 2.6;
  }

  private createTable(): Mesh {
    const base = MeshBuilder.CreateBox(
      "table-frame",
      { width: TABLE.length + 0.5, height: 0.18, depth: TABLE.width + 0.5 },
      this.scene
    );
    base.position.y = -0.1;
    base.material = this.materials.frame;

    const felt = MeshBuilder.CreateGround("felt", { width: TABLE.length, height: TABLE.width }, this.scene);
    felt.position.y = 0;
    felt.material = this.materials.felt;

    for (const segment of createCushionSegments()) {
      const rail = MeshBuilder.CreateBox(
        "rail",
        {
          width: segment.halfX * 2,
          height: TABLE.cushionHeight,
          depth: segment.halfZ * 2
        },
        this.scene
      );
      rail.position.set(segment.x, TABLE.cushionHeight / 2, segment.z);
      rail.material = this.materials.rail;
    }

    for (const pocket of POCKETS) {
      const pocketMesh = MeshBuilder.CreateCylinder(
        `pocket-${pocket.id}`,
        { diameter: TABLE.pocketRadius * 2.15, height: 0.018, tessellation: 48 },
        this.scene
      );
      pocketMesh.position.set(pocket.x, 0.006, pocket.z);
      pocketMesh.material = this.materials.pocket;
    }

    return felt;
  }

  private createPlacementMarker(): Mesh {
    const marker = MeshBuilder.CreateTorus(
      "placement-marker",
      { diameter: TABLE.ballRadius * 2.35, thickness: 0.006, tessellation: 40 },
      this.scene
    );
    marker.position.y = 0.012;
    marker.material = this.materials.marker;
    marker.setEnabled(false);
    return marker;
  }

  private createBallNode(number: number): BallNode {
    const root = new TransformNode(`ball-${number}`, this.scene);
    const sphere = MeshBuilder.CreateSphere(
      `ball-${number}-sphere`,
      { diameter: TABLE.ballRadius * 2, segments: 32 },
      this.scene
    );
    sphere.parent = root;
    sphere.material = this.createBallMaterial(number);

    if (number >= 9 && number <= 15) {
      const stripe = MeshBuilder.CreateTorus(
        `ball-${number}-stripe`,
        { diameter: TABLE.ballRadius * 1.55, thickness: TABLE.ballRadius * 0.26, tessellation: 32 },
        this.scene
      );
      stripe.parent = root;
      stripe.material = this.createBallMaterial(number);
    }

    if (number > 0) {
      const label = MeshBuilder.CreatePlane(`ball-${number}-label`, { size: TABLE.ballRadius * 0.86 }, this.scene);
      label.parent = root;
      label.position.y = TABLE.ballRadius + 0.002;
      label.rotation.x = Math.PI / 2;
      label.material = this.createNumberMaterial(number);
    }

    return { root, number };
  }

  private createBallMaterial(number: number): StandardMaterial {
    const key = `ball-${number}`;
    const cached = this.materials[key] as StandardMaterial | undefined;
    if (cached) return cached;
    const mat = new StandardMaterial(key, this.scene);
    mat.diffuseColor = Color3.FromHexString(BALL_COLORS[number] ?? "#ffffff");
    mat.specularColor = Color3.FromHexString("#f2f2f2");
    mat.emissiveColor = mat.diffuseColor.scale(number === 0 ? 0.08 : 0.02);
    this.materials[key] = mat;
    return mat;
  }

  private createNumberMaterial(number: number): StandardMaterial {
    const mat = new StandardMaterial(`ball-${number}-num-mat`, this.scene);
    const texture = new DynamicTexture(`ball-${number}-num`, { width: 96, height: 96 }, this.scene, false);
    texture.hasAlpha = true;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 96, 96);
    ctx.beginPath();
    ctx.arc(48, 48, 35, 0, Math.PI * 2);
    ctx.fillStyle = number === 8 ? "#f8f1de" : "#f7f1df";
    ctx.fill();
    ctx.fillStyle = "#101010";
    ctx.font = "bold 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), 48, 50);
    texture.update();
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.opacityTexture = texture;
    mat.specularColor = Color3.Black();
    return mat;
  }
}
