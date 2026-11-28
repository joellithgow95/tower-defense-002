/** Draws a match. It only reads the state; it never changes the game. */
import * as THREE from 'three';
import { CELL, inTerritory, nearEnemyCastle, troopPosition } from '../core/sim';
import type { Config, GameEvent, State } from '../core/types';
import { TEAM_COLORS, castleModel, rockModel, towerModel, troopModel } from './models';

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
  const towers = new Map<number, THREE.Group>();
  const troops = new Map<number, { model: THREE.Group; bar: THREE.Mesh }>();
  let effects: { mesh: THREE.Mesh; age: number; life: number; update: (p: number) => void }[] = [];
  let size = { width: 1, height: 1 };

  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55 }));
  cursor.rotation.x = -Math.PI / 2;
  cursor.position.y = 0.02;
  const range = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  range.rotation.x = -Math.PI / 2;
  range.position.y = 0.03;
  scene.add(cursor, range);

  // Land: a faint team-coloured tint on every cell a side may build on, redrawn when buildings change.
  // The dark ring marks where you (the left player) may not build, around the enemy castle.
  const flat = new THREE.PlaneGeometry(0.98, 0.98);
  const tint = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const landTints = TEAM_COLORS.map((c) => tint(c, 0.2));
  const noBuildTint = tint(0x10141c, 0.35);
  let land: THREE.Mesh[][] = [[], []], noBuild: THREE.Mesh[] = [], landKey = '';

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
    land = [[], []];
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
      land[0].push(overlay(landTints[0], cell, 0.004));
      land[1].push(overlay(landTints[1], cell, 0.008));
      noBuild.push(overlay(noBuildTint, cell, 0.012));
      const ground = new THREE.Mesh(tile, greens[(x + y) % 2]);
      place(ground, cell);
      ground.position.y = -0.15;
      ground.receiveShadow = true;
      board.add(ground);
      if (rock) { const r = rockModel(cell); place(r, cell); board.add(r); }
    });
    state.bases.forEach((cell, team) => { const c = castleModel(team as 0 | 1); place(c, cell); board.add(c); });
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
        const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({ color: TEAM_COLORS[e.team], transparent: true }));
        mesh.position.set(worldX(e.x / CELL), 0.3, worldZ(e.y / CELL));
        addEffect(mesh, 0.35, (p) => { mesh.scale.setScalar(1 + p * 1.5); (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p; });
      }
    }
  }

  function drawLand(state: State, cfg: Config) {
    const key = state.towers.filter((t) => t.demolish === 0).map((t) => t.uid).join();
    if (key === landKey) return;
    landKey = key;
    state.rock.forEach((rock, cell) => {
      const open = !rock && !state.bases.includes(cell);
      for (const team of [0, 1] as const) land[team][cell].visible = open && inTerritory(state, cfg.rules, team, cell);
      noBuild[cell].visible = open && cfg.rules.castleNoBuildRadius > 0 && nearEnemyCastle(state, cfg.rules, 0, cell);
    });
  }

  function draw(state: State, cfg: Config, seconds: number) {
    drawLand(state, cfg);
    const liveTowers = new Set(state.towers.map((t) => t.uid));
    for (const [uid, model] of towers) if (!liveTowers.has(uid)) { board.remove(model); towers.delete(uid); }
    for (const t of state.towers) {
      let model = towers.get(t.uid);
      if (!model) { towers.set(t.uid, (model = towerModel(t.id, t.team))); place(model, t.cell); board.add(model); }
      // A tower being sold sinks into the ground.
      model.scale.y = t.demolish ? 0.25 + (0.75 * t.demolish) / cfg.rules.demolishTicks : 1;
    }
    const liveTroops = new Set(state.troops.map((t) => t.uid));
    for (const [uid, v] of troops) if (!liveTroops.has(uid)) { board.remove(v.model); troops.delete(uid); }
    for (const t of state.troops) {
      let v = troops.get(t.uid);
      if (!v) {
        const model = troopModel(t.id, t.team);
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
      v.bar.scale.x = t.hp / cfg.content.troops[t.id].health;
      v.bar.visible = t.hp < cfg.content.troops[t.id].health;
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

  function highlight(cell: { x: number; y: number } | null, ok: boolean, radius: number) {
    cursor.visible = !!cell;
    range.visible = !!cell && radius > 0;
    if (!cell) return;
    cursor.position.set(worldX(cell.x), 0.02, worldZ(cell.y));
    (cursor.material as THREE.MeshBasicMaterial).color.set(ok ? 0xbfffa8 : 0xff5252);
    range.position.set(worldX(cell.x), 0.03, worldZ(cell.y));
    range.scale.setScalar(radius || 1);
  }

  addEventListener('resize', frame);
  return { reset, show, draw, cellAt, highlight };
}
