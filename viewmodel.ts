import * as THREE from "three";
import { skinPoreTexture } from "../core/textures";
import { rigidLoft } from "./skin";
import { buildHeldItem } from "./models";

/**
 * First-person arms ("view model"), rendered in a separate pass on top of the world like in ARK.
 * Full arms (upper arm entering from the screen corners → elbow → muscular forearm → detailed hand
 * with jointed fingers, knuckles, tendons and nails). The ARK implant sits on the inner left wrist.
 * Animations: alternating jabs, tool swings, bob/sway, and the implant check that opens the inventory
 * (left forearm rotates palm-up toward the camera, the hand opens and the crystal flares).
 */
interface Finger { base: THREE.Group; mid: THREE.Group; tip: THREE.Group; thumb: boolean }
interface Arm { root: THREE.Group; fore: THREE.Group; hand: THREE.Group; fingers: Finger[]; side: number; gem?: THREE.MeshStandardMaterial }

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private root = new THREE.Group();
  private L: Arm;
  private R: Arm;
  private skin: THREE.MeshStandardMaterial;
  private sleeve: THREE.MeshStandardMaterial;
  private nail: THREE.MeshStandardMaterial;
  private held: THREE.Object3D | null = null;
  private heldId = "__none";
  private punchSide = 0;
  private lastSwing = 0;
  private bobT = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private gemLight: THREE.PointLight;
  implant = 0; // 0 = idle, (0..1] implant-check animation progress

  constructor() {
    this.skin = new THREE.MeshStandardMaterial({ color: "#c68a62", roughness: 0.55, bumpMap: skinPoreTexture(), bumpScale: 0.3 });
    this.sleeve = new THREE.MeshStandardMaterial({ color: "#8a765a", roughness: 0.95 });
    this.nail = new THREE.MeshStandardMaterial({ color: "#e6c2ad", roughness: 0.25 });
    this.hemi = new THREE.HemisphereLight("#dfefff", "#5a4a38", 1.2);
    this.sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    this.sun.position.set(0.5, 1, 0.6);
    this.gemLight = new THREE.PointLight("#5ee6ff", 0, 0.6, 2);
    this.scene.add(this.hemi, this.sun, this.root, this.gemLight);
    this.L = this.buildArm(-1);
    this.R = this.buildArm(1);
    this.root.add(this.L.root, this.R.root);
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  private buildArm(side: number): Arm {
    const root = new THREE.Group(); // elbow
    // upper arm running back past the camera (so the arms visibly connect to the body)
    const upper = rigidLoft([
      { pos: new THREE.Vector3(0, 0, 0.02), w: 0.046, top: 0.046, bot: 0.048 },
      { pos: new THREE.Vector3(side * 0.03, -0.03, 0.2), w: 0.058, top: 0.06, bot: 0.056 },
      { pos: new THREE.Vector3(side * 0.07, -0.08, 0.42), w: 0.066, top: 0.07, bot: 0.064 },
    ], { ring: 14, perSeg: 4, up: new THREE.Vector3(0, 1, 0), capStart: true });
    this.mesh(upper, this.sleeve, root);
    const cuff = new THREE.TorusGeometry(0.05, 0.012, 6, 16);
    this.mesh(cuff.translate(0, 0, 0.03), this.sleeve, root);
    // forearm: muscular loft (brachioradialis bulge near the elbow, tapering wrist)
    const fore = new THREE.Group();
    root.add(fore);
    const foreGeo = rigidLoft([
      { pos: new THREE.Vector3(0, 0, 0.02), w: 0.044, top: 0.042, bot: 0.04 },
      { pos: new THREE.Vector3(0, 0.004, -0.06), w: 0.05, top: 0.047, bot: 0.041, ridge: 0.004 },
      { pos: new THREE.Vector3(0, 0.002, -0.17), w: 0.041, top: 0.036, bot: 0.032 },
      { pos: new THREE.Vector3(0, 0, -0.29), w: 0.031, top: 0.024, bot: 0.022 },
      { pos: new THREE.Vector3(0, 0, -0.33), w: 0.032, top: 0.022, bot: 0.021 },
    ], { ring: 18, perSeg: 5, up: new THREE.Vector3(0, 1, 0), capEnd: true });
    this.mesh(foreGeo, this.skin, fore);
    // wrist bone (ulna head) and tendons on the back
    this.mesh(new THREE.SphereGeometry(0.009, 8, 6).translate(-side * 0.026, 0.008, -0.3), this.skin, fore);
    for (let i = 0; i < 3; i++) this.mesh(new THREE.CylinderGeometry(0.0022, 0.003, 0.12, 5).rotateX(Math.PI / 2).translate((i - 1) * 0.012, 0.022, -0.25), this.skin, fore);
    let gem: THREE.MeshStandardMaterial | undefined;
    if (side < 0) {
      // ARK specimen implant on the inner (palm-side) wrist
      const frameM = new THREE.MeshStandardMaterial({ color: "#6d7a86", metalness: 0.85, roughness: 0.3 });
      this.mesh(new THREE.BoxGeometry(0.034, 0.012, 0.056).translate(0, -0.024, -0.25), frameM, fore);
      for (const z of [-0.226, -0.274]) this.mesh(new THREE.BoxGeometry(0.04, 0.008, 0.006).translate(0, -0.028, z), frameM, fore);
      gem = new THREE.MeshStandardMaterial({ color: "#aaffff", emissive: "#2de0ff", emissiveIntensity: 2 });
      this.mesh(new THREE.OctahedronGeometry(0.012, 0).scale(1, 0.45, 1.7).translate(0, -0.032, -0.25), gem, fore);
    }
    // hand
    const hand = new THREE.Group();
    hand.position.z = -0.335;
    fore.add(hand);
    const palm = rigidLoft([
      { pos: new THREE.Vector3(0, 0, 0.005), w: 0.032, top: 0.016, bot: 0.015 },
      { pos: new THREE.Vector3(0, 0.001, -0.04), w: 0.041, top: 0.017, bot: 0.018 },
      { pos: new THREE.Vector3(0, 0.002, -0.078), w: 0.043, top: 0.014, bot: 0.014 },
    ], { ring: 16, perSeg: 3, up: new THREE.Vector3(0, 1, 0), capEnd: true, capStart: true });
    this.mesh(palm, this.skin, hand);
    // thenar pad (thumb muscle) and metacarpal tendons
    this.mesh(new THREE.SphereGeometry(0.018, 10, 8).scale(1, 0.8, 1.4).translate(-side * 0.022, -0.009, -0.03), this.skin, hand);
    for (let i = 0; i < 4; i++) this.mesh(new THREE.CylinderGeometry(0.0022, 0.0028, 0.06, 5).rotateX(Math.PI / 2).translate((i - 1.5) * 0.0195 * side, 0.014, -0.05), this.skin, hand);
    const fingers: Finger[] = [];
    const lens = [0.03, 0.034, 0.032, 0.025];
    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * 0.0205 * side; // index finger (f=0) next to the thumb (thumb is at -side)
      const base = new THREE.Group();
      base.position.set(x, 0.002, -0.078);
      hand.add(base);
      this.mesh(new THREE.SphereGeometry(0.0105, 8, 6).translate(0, 0.004, 0), this.skin, base); // knuckle
      const L1 = lens[f], L2 = L1 * 0.7, L3 = L1 * 0.55;
      this.mesh(new THREE.CapsuleGeometry(0.0088, L1, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -L1 / 2), this.skin, base);
      const mid = new THREE.Group();
      mid.position.z = -L1;
      base.add(mid);
      this.mesh(new THREE.CapsuleGeometry(0.0082, L2, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -L2 / 2), this.skin, mid);
      const tip = new THREE.Group();
      tip.position.z = -L2;
      mid.add(tip);
      this.mesh(new THREE.CapsuleGeometry(0.0076, L3, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -L3 / 2), this.skin, tip);
      this.mesh(new THREE.SphereGeometry(0.0068, 8, 5).scale(1, 0.35, 1.3).translate(0, 0.0065, -L3 * 0.7), this.nail, tip);
      fingers.push({ base, mid, tip, thumb: false });
    }
    // thumb (2 phalanges, set at an angle)
    const tb = new THREE.Group();
    tb.position.set(-side * 0.034, -0.004, -0.028);
    tb.rotation.set(0.1, side * 0.8, -side * 0.4);
    hand.add(tb);
    this.mesh(new THREE.CapsuleGeometry(0.0105, 0.03, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.015), this.skin, tb);
    const tm = new THREE.Group();
    tm.position.z = -0.03;
    tb.add(tm);
    this.mesh(new THREE.CapsuleGeometry(0.0095, 0.022, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.011), this.skin, tm);
    const tt = new THREE.Group();
    tt.position.z = -0.022;
    tm.add(tt);
    this.mesh(new THREE.SphereGeometry(0.0075, 8, 5).scale(1, 0.35, 1.3).translate(0, 0.006, -0.004), this.nail, tt);
    fingers.push({ base: tb, mid: tm, tip: tt, thumb: true });
    return { root, fore, hand, fingers, side, gem };
  }

  /** Curl 0 = open flat hand, 1 = tight fist. */
  private curl(a: Arm, c: number) {
    // palm faces -Y (the implant/palm side) and nails face +Y, so fingers flex toward -Y
    for (const f of a.fingers) {
      if (f.thumb) {
        // thumb wraps across the curled fingers (over the middle phalanges)
        f.base.rotation.set(-0.15 - c * 0.35, a.side * (0.8 - c * 0.45), -a.side * (0.4 + c * 0.35));
        f.mid.rotation.x = -(0.2 + c * 0.7);
        f.mid.rotation.y = a.side * c * 0.35;
        continue;
      }
      f.base.rotation.x = -c * 1.45;
      f.mid.rotation.x = -c * 1.65;
      f.tip.rotation.x = -c * 0.95;
    }
  }

  setLook(skin: string) {
    this.skin.color.set(skin);
  }

  setHeld(id: string) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.held) this.R.hand.remove(this.held);
    this.held = id ? buildHeldItem(id) : null;
    if (this.held) {
      this.held.scale.setScalar(0.9);
      this.held.rotation.set(-0.2, 0, 0);
      this.held.position.set(0, -0.012, -0.05);
      this.held.traverse((o) => { (o as THREE.Mesh).frustumCulled = false; });
      this.R.hand.add(this.held);
    }
  }

  resize(aspect: number, fov: number) {
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(70, fov);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, swing: number, speed: number, onGround: boolean, yaw: number, pitch: number, dayLight: number, t: number) {
    if (swing > this.lastSwing + 0.3 && !this.heldId) this.punchSide = 1 - this.punchSide;
    this.lastSwing = swing;
    const moving = onGround ? Math.min(1, speed / 4) : 0;
    this.bobT += dt * (4 + speed * 1.6) * (moving > 0.05 ? 1 : 0.25);
    const bobX = Math.sin(this.bobT) * 0.012 * moving;
    const bobY = -Math.abs(Math.cos(this.bobT)) * 0.014 * moving + Math.sin(t * 1.6) * 0.003;
    let dy = yaw - this.lastYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.swayX += (THREE.MathUtils.clamp(dy * 1.5, -0.06, 0.06) - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (THREE.MathUtils.clamp(-dp * 1.5, -0.05, 0.05) - this.swayY) * Math.min(1, dt * 8);
    this.root.position.set(bobX + this.swayX, bobY + this.swayY, 0);
    const L = this.L.root, R = this.R.root;
    // guard pose: fists raised, elbows out (ARK unarmed stance)
    L.position.set(-0.17, -0.19, -0.1);
    R.position.set(0.17, -0.19, -0.1);
    L.rotation.set(0.22, 0.28, 0.35);
    R.rotation.set(0.22, -0.28, -0.35);
    this.L.fore.rotation.set(0, 0, 0);
    this.R.fore.rotation.set(0, 0, 0);
    this.L.hand.rotation.set(0.1, 0, 0);
    this.R.hand.rotation.set(0.1, 0, 0);
    this.curl(this.L, 1);
    this.curl(this.R, this.heldId ? 0.85 : 1);
    const s = swing > 0 ? Math.sin((1 - swing) * Math.PI) : 0;
    const jab = swing > 0 ? Math.sin(Math.min(1, (1 - swing) * 1.6) * Math.PI) : 0;
    if (!this.heldId) {
      const a = this.punchSide === 0 ? R : L;
      const sd = this.punchSide === 0 ? 1 : -1;
      a.position.z -= jab * 0.24;
      a.position.x -= sd * jab * 0.1;
      a.position.y += jab * 0.07;
      a.rotation.y += sd * jab * 0.4;
      a.rotation.x -= jab * 0.15;
    } else {
      L.position.y -= 0.14;
      L.position.z += 0.06;
      R.position.set(0.21, -0.19 + s * 0.05, -0.09 - s * 0.12);
      R.rotation.set(0.45 - s * 1.4 + (swing > 0.75 ? (swing - 0.75) * 2.4 : 0), -0.25 + s * 0.35, -0.3 + s * 0.4);
    }
    // ---- implant check (inventory): raise the left forearm, roll it palm-up, open the hand, crystal flares
    let flare = 0;
    if (this.implant > 0) {
      const k = THREE.MathUtils.smoothstep(this.implant, 0, 0.55);
      const e = k * k * (3 - 2 * k);
      L.position.lerp(new THREE.Vector3(-0.03, -0.17, -0.26), e);
      L.rotation.set(THREE.MathUtils.lerp(L.rotation.x, 0.55, e), THREE.MathUtils.lerp(L.rotation.y, 0.55, e), THREE.MathUtils.lerp(L.rotation.z, 0.1, e));
      this.L.fore.rotation.z = -2.75 * e; // supination: inner wrist faces the camera
      this.L.hand.rotation.x = 0.1 - 0.35 * e;
      this.curl(this.L, 1 - 0.75 * e);
      R.position.y -= 0.12 * e;
      flare = THREE.MathUtils.smoothstep(this.implant, 0.35, 0.7);
    }
    if (this.L.gem) this.L.gem.emissiveIntensity = 2 + flare * 5 + Math.sin(t * 6) * 0.3;
    this.gemLight.intensity = flare * 1.2;
    this.gemLight.position.set(-0.02, -0.08, -0.35);
    const l = 0.5 + dayLight * 0.75;
    this.hemi.intensity = 1.2 * l;
    this.sun.intensity = 1.6 * l;
  }
}
