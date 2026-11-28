/** Draws a match. It only reads the state; it never changes the game. */
import * as THREE from 'three';
import { CELL, alive, inTerritory, nearEnemyCastle, players, troopHealth, troopPosition } from '../core/sim';
import type { Config, GameEvent, Player, State } from '../core/types';

/** A player this screen controls, and where its wisp is pointing (null while walking or idle). */
export type LocalSpirit = { player: Player; wisp: { x: number; y: number } | null };
import { PLAYER_COLORS, castleModel, rockModel, spiritModel, towerModel, troopModel } from './models';

export function createView(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2433);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a4030, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.7);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  scene.add(sun);

  let board = new THREE.Group();
  scene.add(board);
  const towers = new Map<number, { model: THREE.Group; ruined: boolean }>();
  const troops = new Map<number, { model: THREE.Group; bar: THREE.Mesh }>();
  let effects: { mesh: THREE.Mesh; age: number; life: number; update: (p: number) => void }[] = [];
  let size = { width: 1, height: 1 };
  let spirits: { walk: THREE.Group; cursor: THREE.Group; reach: THREE.Mesh }[] = [];
  const reachGeometry = new THREE.RingGeometry(0.95, 1, 48);

  const cursorGeometry = new THREE.PlaneGeometry(0.96, 0.96);
  const rangeGeometry = new THREE.RingGeometry(0.97, 1, 64);
  const targetGeometry = new THREE.RingGeometry(0.62, 0.74, 6);
  const markers = PLAYER_COLORS.map((color) => {
    const cursor = new THREE.Mesh(cursorGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.65, depthWrite: false }));
    const range = new THREE.Mesh(rangeGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, depthWrite: false }));
    const target = new THREE.Mesh(targetGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    for (const marker of [cursor, range, target]) {
      marker.rotation.x = -Math.PI / 2;
      marker.visible = false;
      scene.add(marker);
    }
    return { cursor, range, target };
  });

  // Land: a faint player-coloured tint on every cell a player may build on, redrawn when buildings change.
  // The dark ring marks where you may not build, around enemy castles.
  const flat = new THREE.PlaneGeometry(0.98, 0.98);
  const tint = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const landTints = PLAYER_COLORS.map((c) => tint(c, 0.2));
  const noBuildTint = tint(0x10141c, 0.35);
  let land: THREE.Mesh[][] = [], noBuild: THREE.Mesh[] = [], landKey = '';

  // World coordinates: the board is centred on the origin, x across and z down.
  const worldX = (cellX: number) => cellX - (size.width - 1) / 2;
  const worldZ = (cellY: number) => cellY - (size.height - 1) / 2;
  const place = (o: THREE.Object3D, cell: number) => o.position.set(worldX(cell % size.width), 0, worldZ(Math.floor(cell / size.width)));

  /** Pull the camera back until the board fits the window, whatever its size. */
  function frame() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tilt = new THREE.Vector3(0, 1, 0.72).normalize();
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 1.4].map((y) => new THREE.Vector3((x * size.width) / 2, y, (z * size.height) / 2))));
    for (let distance = 10; distance < 400; distance += 0.5) {
      camera.position.copy(tilt).multiplyScalar(distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      if (corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.76; })) break;
    }
  }

  function reset(state: State) {
    scene.remove(board);
    board = new THREE.Group();
    scene.add(board);
    towers.clear();
    troops.clear();
    effects = [];
    size = state;
    const tile = new THREE.BoxGeometry(0.98, 0.3, 0.98);
    const greens = [0x6fae5a, 0x679f54].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    land = state.bases.map(() => []);
    noBuild = [];
    landKey = '';
    const overlay = (material: THREE.Material, cell: number, height: number) => {
      const mesh = new THREE.Mesh(flat, material);
      place(mesh, cell);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = height;
      mesh.visible = false;
      board.add(mesh);
      return mesh;
    };
    state.rock.forEach((rock, cell) => {
      const x = cell % state.width, y = Math.floor(cell / state.width);
      land.forEach((cells, p) => cells.push(overlay(landTints[p], cell, 0.004 * (p + 1))));
      noBuild.push(overlay(noBuildTint, cell, 0.004 * (land.length + 1)));
      const ground = new THREE.Mesh(tile, greens[(x + y) % 2]);
      place(ground, cell);
      ground.position.y = -0.15;
      ground.receiveShadow = true;
      board.add(ground);
      if (rock) { const r = rockModel(cell); place(r, cell); board.add(r); }
    });
    state.bases.forEach((cell, player) => { const c = castleModel(player); place(c, cell); board.add(c); });
    spirits = state.spirits.map((sp, player) => {
      const walk = spiritModel(sp.id, 'walk', player), cursor = spiritModel(sp.id, 'cursor', player);
      const reach = new THREE.Mesh(reachGeometry, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[player], transparent: true, opacity: 0.5, depthWrite: false }));
      reach.rotation.x = -Math.PI / 2;
      board.add(walk, cursor, reach);
      return { walk, cursor, reach };
    });
    frame();
  }

  function addEffect(mesh: THREE.Mesh, life: number, update: (p: number) => void) {
    board.add(mesh);
    effects.push({ mesh, age: 0, life, update });
  }
  const arrowGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.3);
  const puffGeometry = new THREE.DodecahedronGeometry(0.2, 0);

  function show(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'shot') {
        const mesh = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
        const from = new THREE.Vector3(); place(mesh, e.from); from.copy(mesh.position).setY(1);
        const to = new THREE.Vector3(worldX(e.x / CELL), 0.3, worldZ(e.y / CELL));
        addEffect(mesh, 0.12, (p) => { mesh.position.lerpVectors(from, to, p); mesh.lookAt(to); });
      } else if (e.type === 'death') {
        const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[e.player], transparent: true }));
        mesh.position.set(worldX(e.x / CELL), 0.3, worldZ(e.y / CELL));
        addEffect(mesh, 0.35, (p) => { mesh.scale.setScalar(1 + p * 1.5); (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p; });
      }
    }
  }

  /** Fallen players have no land. `me` sees the no-build rings round their own enemies' castles. */
  function drawLand(state: State, cfg: Config, me: Player | null) {
    const key = me + '|' + state.towers.filter((t) => t.demolish === 0).map((t) => t.uid).join() + '|' + state.baseHealth.map((h) => h > 0).join();
    if (key === landKey) return;
    landKey = key;
    state.rock.forEach((rock, cell) => {
      const open = !rock && !state.bases.includes(cell);
      for (const p of players(state)) land[p][cell].visible = open && alive(state, p) && inTerritory(state, cfg.rules, p, cell);
      noBuild[cell].visible = open && me !== null && cfg.rules.castleNoBuildRadius > 0 && nearEnemyCastle(state, cfg.rules, me, cell);
    });
  }

  /** Bodies walk where the state says. A wisp flies at its player's cursor here, and elsewhere at the last cell it built on. */
  function drawSpirits(state: State, cfg: Config, locals: LocalSpirit[]) {
    const now = performance.now();
    state.spirits.forEach((sp, p) => {
      const v = spirits[p];
      if (!v) return;
      const standing = alive(state, p);
      const mine = locals.find((l) => l.player === p);
      v.walk.visible = standing;
      v.walk.position.set(worldX(sp.x / CELL), 0, worldZ(sp.y / CELL));
      // In cursor mode the body rests, smaller, where it was left.
      v.walk.scale.setScalar(sp.mode === 'walk' ? 1 : 0.65);
      v.reach.visible = standing && !!mine && sp.mode === 'walk';
      v.reach.position.set(v.walk.position.x, 0.05, v.walk.position.z);
      v.reach.scale.setScalar(cfg.content.spirits[sp.id].reach / 1000);
      v.cursor.visible = standing && sp.mode === 'cursor' && (!mine || !!mine.wisp);
      const cell = mine?.wisp ?? { x: sp.wispCell % state.width, y: Math.floor(sp.wispCell / state.width) };
      v.cursor.position.set(worldX(cell.x), Math.sin(now / 300 + p) * 0.08, worldZ(cell.y));
    });
  }

  function draw(state: State, cfg: Config, seconds: number, me: Player | null, locals: LocalSpirit[] = []) {
    drawLand(state, cfg, me);
    drawSpirits(state, cfg, locals);
    const liveTowers = new Set(state.towers.map((t) => t.uid));
    for (const [uid, v] of towers) if (!liveTowers.has(uid)) { board.remove(v.model); towers.delete(uid); }
    for (const t of state.towers) {
      let v = towers.get(t.uid);
      const ruined = !alive(state, t.player);
      if (v && v.ruined !== ruined) { board.remove(v.model); v = undefined; }
      if (!v) { towers.set(t.uid, (v = { model: towerModel(t.id, t.player, ruined), ruined })); place(v.model, t.cell); board.add(v.model); }
      // A tower being sold sinks into the ground.
      if (!ruined) v.model.scale.y = t.demolish ? 0.25 + (0.75 * t.demolish) / cfg.rules.demolishTicks : 1;
    }
    const liveTroops = new Set(state.troops.map((t) => t.uid));
    for (const [uid, v] of troops) if (!liveTroops.has(uid)) { board.remove(v.model); troops.delete(uid); }
    for (const t of state.troops) {
      let v = troops.get(t.uid);
      if (!v) {
        const model = troopModel(t.id, t.player);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x8dff70 }));
        bar.position.y = 0.95;
        model.add(bar);
        board.add(model);
        troops.set(t.uid, (v = { model, bar }));
      }
      const p = troopPosition(state, t);
      v.model.position.set(worldX(p.x / CELL), Math.abs(Math.sin(performance.now() / 110 + t.uid)) * 0.05, worldZ(p.y / CELL));
      v.model.rotation.y = Math.atan2((t.to % state.width) - (t.from % state.width), Math.floor(t.to / state.width) - Math.floor(t.from / state.width));
      v.bar.rotation.y = -v.model.rotation.y;
      const full = troopHealth(state, cfg, t.player, t.id);
      v.bar.scale.x = Math.min(1, t.hp / full);
      v.bar.visible = t.hp < full;
    }
    effects = effects.filter((e) => {
      e.age += seconds;
      if (e.age >= e.life) { board.remove(e.mesh); (e.mesh.material as THREE.Material).dispose(); return false; }
      e.update(e.age / e.life);
      return true;
    });
    renderer.render(scene, camera);
  }

  const ray = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    ray.setFromCamera(new THREE.Vector2((clientX / canvas.clientWidth) * 2 - 1, 1 - (clientY / canvas.clientHeight) * 2), camera);
    const hit = ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (!hit) return null;
    const x = Math.round(hit.x + (size.width - 1) / 2), y = Math.round(hit.z + (size.height - 1) / 2);
    return x >= 0 && y >= 0 && x < size.width && y < size.height ? { x, y } : null;
  }

  function highlight(player: Player, cell: { x: number; y: number } | null, ok: boolean, radius: number, aimedAt: number) {
    const { cursor, range, target } = markers[player];
    cursor.visible = !!cell;
    range.visible = !!cell && radius > 0;
    target.visible = aimedAt >= 0;
    if (target.visible) {
      place(target, aimedAt);
      target.position.y = 0.06 + player * 0.003;
      target.scale.setScalar(1 + player * 0.15);
    }
    if (!cell) return;
    cursor.position.set(worldX(cell.x), 0.02 + player * 0.003, worldZ(cell.y));
    cursor.material.color.set(PLAYER_COLORS[player]);
    cursor.material.opacity = ok ? 0.8 : 0.35;
    cursor.scale.setScalar(1 - player * 0.14);
    range.position.set(worldX(cell.x), 0.04 + player * 0.003, worldZ(cell.y));
    range.scale.setScalar(radius || 1);
  }

  addEventListener('resize', frame);
  return { reset, show, draw, cellAt, highlight };
}
