/**
 * Every model is built in code from simple shapes. One cell is 1 unit wide.
 * Art ideas start here: change a colour or add a shape, save, and look at the game.
 */
import * as THREE from 'three';
import type { Player } from '../core/types';

/** One colour per player: blue, orange, yellow, purple. Player 0's is first. */
export const PLAYER_COLORS = [0x4da3ff, 0xff7a59, 0xffd166, 0xb07cff] as const;
/** A fallen player's buildings turn to grey ruins. */
const RUIN = 0x6f6a62;

const materials = new Map<number, THREE.MeshLambertMaterial>();
const mat = (color: number) => {
  let m = materials.get(color);
  if (!m) materials.set(color, (m = new THREE.MeshLambertMaterial({ color, flatShading: true })));
  return m;
};
const geometries = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geometries.get(key);
  if (!g) geometries.set(key, (g = make()));
  return g;
};

function part(group: THREE.Group, g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(g, mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
const box = (w: number, h: number, d: number) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const tube = (top: number, bottom: number, h: number, sides: number) => geo(`c${top},${bottom},${h},${sides}`, () => new THREE.CylinderGeometry(top, bottom, h, sides));
const cone = (r: number, h: number, sides: number) => geo(`k${r},${h},${sides}`, () => new THREE.ConeGeometry(r, h, sides));
const lump = (r: number) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));

const STONE = 0xb8b2a6, WOOD = 0x8a5a3b, SKIN = 0xf2c29b, STEEL = 0xc9d3dd;

const towers: Record<string, (g: THREE.Group, color: number) => void> = {
  archer(g, color) {
    part(g, tube(0.28, 0.36, 0.8, 7), STONE, 0, 0.4, 0);
    part(g, tube(0.38, 0.34, 0.18, 7), WOOD, 0, 0.88, 0);
    part(g, cone(0.42, 0.45, 7), color, 0, 1.28, 0);
  },
  barracks(g, color) {
    part(g, box(0.82, 0.4, 0.7), STONE, 0, 0.2, 0);
    part(g, cone(0.64, 0.42, 4), color, 0, 0.61, 0).rotation.y = Math.PI / 4;
    part(g, box(0.2, 0.26, 0.05), WOOD, 0, 0.13, 0.36);
  },
  knight_hall(g, color) {
    part(g, box(0.86, 0.55, 0.74), STONE, 0, 0.28, 0);
    for (const x of [-0.34, 0.34]) {
      part(g, tube(0.14, 0.16, 0.95, 6), STONE, x, 0.48, -0.26);
      part(g, cone(0.2, 0.32, 6), color, x, 1.11, -0.26);
    }
    part(g, box(0.9, 0.12, 0.78), color, 0, 0.6, 0);
    part(g, box(0.28, 0.34, 0.05), WOOD, 0, 0.17, 0.38);
  },
};

const troops: Record<string, (g: THREE.Group, color: number) => void> = {
  soldier(g, color) {
    part(g, tube(0.1, 0.15, 0.28, 6), color, 0, 0.2, 0);
    part(g, lump(0.11), SKIN, 0, 0.43, 0);
    part(g, cone(0.12, 0.14, 6), STEEL, 0, 0.55, 0);
  },
  knight(g, color) {
    part(g, box(0.34, 0.38, 0.28), STEEL, 0, 0.27, 0);
    part(g, box(0.22, 0.22, 0.22), STEEL, 0, 0.58, 0);
    part(g, box(0.06, 0.16, 0.2), color, 0, 0.76, 0);
    part(g, box(0.07, 0.3, 0.26), color, 0.23, 0.28, 0.04);
  },
};

/** A tower or troop the code has no model for yet shows as a player-coloured block, so new content still works. */
function build(table: typeof towers, id: string, color: number) {
  const g = new THREE.Group();
  if (table[id]) table[id](g, color);
  else part(g, box(0.5, 0.5, 0.5), color, 0, 0.25, 0);
  return g;
}
export const towerModel = (id: string, player: Player, ruined = false) => {
  const g = build(towers, id, ruined ? RUIN : PLAYER_COLORS[player]);
  if (ruined) g.scale.y = 0.6;
  return g;
};
export const troopModel = (id: string, player: Player) => {
  const g = build(troops, id, PLAYER_COLORS[player]);
  g.scale.setScalar(1.35);
  return g;
};

export function castleModel(player: Player) {
  const g = new THREE.Group();
  part(g, box(0.8, 0.7, 0.8), STONE, 0, 0.35, 0);
  for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) {
    part(g, tube(0.17, 0.19, 1, 6), STONE, x, 0.5, z);
    part(g, cone(0.24, 0.38, 6), PLAYER_COLORS[player], x, 1.19, z);
  }
  part(g, box(0.05, 0.6, 0.05), WOOD, 0, 1, 0);
  part(g, box(0.34, 0.2, 0.03), PLAYER_COLORS[player], 0.18, 1.18, 0);
  return g;
}

export function rockModel(seed: number) {
  const g = new THREE.Group();
  part(g, lump(0.38), 0x7d8594, 0, 0.2, 0).rotation.set(seed, seed * 1.7, 0);
  part(g, lump(0.19), 0x9aa1ad, 0.26, 0.1, 0.22).rotation.set(seed * 2.3, seed, 0);
  return g;
}
