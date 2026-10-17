import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  BufferGeometry,
  Float32BufferAttribute,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArchitectureStyle } from "./urbanIdentity";
export { buildingHeight, buildingFootprint } from "./buildingScale";

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

export type TowerStyle = ArchitectureStyle;
export function towerStyle(id: string): TowerStyle {
  return (["spiral", "gateway", "pagoda", "crown", "slab"] as const)[
    stableHash(id) % 5
  ];
}

function box(w: number, h: number, d: number, x: number, y: number, z = 0) {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

function combine(parts: BufferGeometry[]) {
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

function pitchedRoof(w: number, h: number, d: number, x: number, y: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -w / 2,
        0,
        -d / 2,
        w / 2,
        0,
        -d / 2,
        0,
        h,
        -d / 2,
        -w / 2,
        0,
        d / 2,
        w / 2,
        0,
        d / 2,
        0,
        h,
        d / 2,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  flat.translate(x, y, 0);
  return flat;
}

function createTowerGeometry(style: TowerStyle) {
  if (style === "twin")
    return combine([
      box(0.43, 1, 0.7, -0.25, 0.5, -0.08),
      box(0.38, 0.65, 0.65, 0.26, 0.325, 0.1),
      box(0.28, 0.08, 0.35, 0.02, 0.48),
    ]);
  if (style === "campus")
    return combine(
      [-0.34, 0, 0.34].map((x) => box(0.29, 0.73, 0.88, x, 0.365)),
    );
  if (style === "courtyard")
    return combine([
      box(1, 0.75, 0.23, 0, 0.375, -0.37),
      box(0.23, 0.9, 0.75, -0.385, 0.45),
      box(0.23, 0.9, 0.75, 0.385, 0.45),
      box(0.35, 0.58, 0.23, -0.325, 0.29, 0.37),
      box(0.35, 0.58, 0.23, 0.325, 0.29, 0.37),
    ]);
  if (style === "terrace")
    return combine([
      box(1, 0.4, 0.92, 0, 0.2),
      box(0.76, 0.33, 0.68, -0.1, 0.565, -0.1),
      box(0.52, 0.27, 0.46, -0.2, 0.865, -0.2),
    ]);
  if (style === "vault") return box(0.95, 0.76, 0.85, 0, 0.38);
  if (style === "hall")
    return combine([
      box(1, 0.7, 0.5, 0, 0.35, -0.15),
      box(0.32, 0.9, 0.9, -0.34, 0.45),
    ]);
  if (style === "pavilion")
    return new CylinderGeometry(0.46, 0.5, 0.62, 12).translate(0, 0.31, 0);
  if (style === "spiral") {
    const geometry = new CylinderGeometry(0.3, 0.55, 1, 12, 24).translate(
      0,
      0.5,
      0,
    );
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const x = positions.getX(i);
      const z = positions.getZ(i) * 0.78;
      const angle = y * Math.PI * 0.75;
      positions.setXYZ(
        i,
        x * Math.cos(angle) - z * Math.sin(angle),
        y,
        x * Math.sin(angle) + z * Math.cos(angle),
      );
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  if (style === "crown") {
    const geometry = new CylinderGeometry(0.32, 0.65, 1, 4, 1).translate(
      0,
      0.5,
      0,
    );
    geometry.rotateY(Math.PI / 4);
    return geometry;
  }
  const parts =
    style === "gateway"
      ? [
          box(1, 0.81, 0.65, 0, 0.405),
          box(0.16, 0.15, 0.65, -0.34, 0.885),
          box(0.16, 0.15, 0.65, 0.34, 0.885),
          box(0.84, 0.04, 0.65, 0, 0.98),
        ]
      : style === "pagoda"
        ? Array.from({ length: 9 }, (_, i) =>
            box(1 - i * 0.085, 0.115, 1 - i * 0.085, 0, 0.0575 + i * 0.108),
          )
        : [box(1, 1, 0.75, 0, 0.5)];
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

// Shared geometry: changing a timeline step never rebuilds a tower mesh.
export const towerGeometries = {
  spiral: createTowerGeometry("spiral"),
  gateway: createTowerGeometry("gateway"),
  pagoda: createTowerGeometry("pagoda"),
  crown: createTowerGeometry("crown"),
  slab: createTowerGeometry("slab"),
  twin: createTowerGeometry("twin"),
  campus: createTowerGeometry("campus"),
  courtyard: createTowerGeometry("courtyard"),
  terrace: createTowerGeometry("terrace"),
  vault: createTowerGeometry("vault"),
  pavilion: createTowerGeometry("pavilion"),
  hall: createTowerGeometry("hall"),
};

export const roofGeometries: Partial<
  Record<ArchitectureStyle, BufferGeometry>
> = {
  campus: combine(
    [-0.34, 0, 0.34].map((x) => pitchedRoof(0.32, 0.25, 0.94, x, 0.73)),
  ),
  courtyard: combine([
    box(1, 0.06, 0.27, 0, 0.78, -0.37),
    box(0.27, 0.06, 0.81, -0.385, 0.93),
    box(0.27, 0.06, 0.81, 0.385, 0.93),
  ]),
  terrace: combine([
    box(1.04, 0.035, 0.96, 0, 0.41),
    box(0.8, 0.035, 0.72, -0.1, 0.745, -0.1),
    box(0.55, 0.035, 0.5, -0.2, 1.015, -0.2),
  ]),
  vault: combine([
    box(1, 0.07, 0.9, 0, 0.8),
    box(0.23, 0.14, 0.42, -0.22, 0.9),
    box(0.23, 0.14, 0.42, 0.22, 0.9),
  ]),
  pavilion: new SphereGeometry(0.51, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    .scale(1, 0.75, 1)
    .translate(0, 0.62, 0),
  hall: combine([
    box(1.04, 0.07, 0.55, 0, 0.735, -0.15),
    box(0.36, 0.07, 0.94, -0.34, 0.935),
  ]),
};
