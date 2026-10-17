import { useCallback, useLayoutEffect, useMemo, type Ref } from "react";
import {
  Color,
  Vector2,
  type MeshStandardMaterial,
  type ColorRepresentation,
} from "three";
import type { FacadeDesign, UrbanAppearance } from "./urbanIdentity";

type Shader = Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
const patterns = ["curtain", "ribbon", "arcade", "lattice", "panels", "quiet"];
const fallback: FacadeDesign = {
  pattern: "curtain",
  bayWidth: 0.45,
  floorHeight: 1.5,
  occupancy: 0.4,
  warmth: 0.3,
  brightness: 0.4,
  seed: 1,
  cool: "#a1d6f5",
  warm: "#ffd6a0",
};

/** Shared shader, per-building uniforms: role-specific windows without per-window meshes. */
export default function FacadeMaterial({
  color,
  appearance,
  materialRef,
}: {
  color: ColorRepresentation;
  appearance?: UrbanAppearance;
  materialRef?: Ref<MeshStandardMaterial>;
}) {
  const design = appearance?.facade ?? fallback;
  const uniforms = useMemo(
    () => ({
      facadeScale: { value: new Vector2() },
      facadePattern: { value: 0 },
      facadeSeed: { value: 0 },
      facadeOccupancy: { value: 0.4 },
      facadeWarmth: { value: 0.3 },
      facadeBrightness: { value: 0.4 },
      facadeCool: { value: new Color() },
      facadeWarm: { value: new Color() },
    }),
    [],
  );
  useLayoutEffect(() => {
    uniforms.facadeScale.value.set(1 / design.bayWidth, 1 / design.floorHeight);
    uniforms.facadePattern.value = patterns.indexOf(design.pattern);
    uniforms.facadeSeed.value = design.seed;
    uniforms.facadeOccupancy.value = design.occupancy;
    uniforms.facadeWarmth.value = design.warmth;
    uniforms.facadeBrightness.value = design.brightness;
    uniforms.facadeCool.value.set(design.cool);
    uniforms.facadeWarm.value.set(design.warm);
  }, [uniforms, design]);
  const compile = useCallback(
    (shader: Shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
      varying vec3 vFacadePosition; varying vec3 vFacadeNormal; varying float vInstanceSeed;`,
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
      vec4 facadeWorld = vec4(transformed, 1.0);
      vec4 facadeOrigin = vec4(0.0, 0.0, 0.0, 1.0);
      vInstanceSeed = 0.0;
      #ifdef USE_INSTANCING
        facadeWorld = instanceMatrix * facadeWorld;
        facadeOrigin = instanceMatrix * facadeOrigin;
        vInstanceSeed = dot(facadeOrigin.xz, vec2(17.13, 31.77));
      #endif
      vFacadePosition = (modelMatrix * facadeWorld).xyz - (modelMatrix * facadeOrigin).xyz;
      vFacadeNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
      varying vec3 vFacadePosition; varying vec3 vFacadeNormal; varying float vInstanceSeed;
      uniform vec2 facadeScale; uniform float facadePattern; uniform float facadeSeed;
      uniform float facadeOccupancy; uniform float facadeWarmth; uniform float facadeBrightness;
      uniform vec3 facadeCool; uniform vec3 facadeWarm;
      float facadeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float facadeBand(float x, float lo, float hi, float aa) { return smoothstep(lo-aa, lo+aa, x) * (1.0-smoothstep(hi-aa, hi+aa, x)); }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
      float horizontal = abs(vFacadeNormal.z) > abs(vFacadeNormal.x) ? vFacadePosition.x : vFacadePosition.z;
      vec2 grid = vec2(horizontal, vFacadePosition.y) * facadeScale;
      vec2 cell = fract(grid); vec2 aa = max(fwidth(grid), vec2(0.015));
      float windowMask = facadeBand(cell.x, 0.15, 0.8, aa.x) * facadeBand(cell.y, 0.18, 0.74, aa.y);
      if (facadePattern > 0.5 && facadePattern < 1.5) {
        windowMask = facadeBand(cell.y, 0.35, 0.64, aa.y) * facadeBand(cell.x, 0.03, 0.95, aa.x);
      } else if (facadePattern > 1.5 && facadePattern < 2.5) {
        float archTop = 0.52 + sqrt(max(0.0, 0.09 - pow(cell.x - 0.5, 2.0)));
        windowMask = facadeBand(cell.x, 0.2, 0.8, aa.x) * facadeBand(cell.y, 0.15, archTop, aa.y);
      } else if (facadePattern > 2.5 && facadePattern < 3.5) {
        float diagonal = abs(fract(grid.x * 0.45 + grid.y * 0.45) - 0.5);
        windowMask *= smoothstep(0.025, 0.09, diagonal);
        totalEmissiveRadiance += facadeCool * (1.0 - smoothstep(0.012, 0.05, diagonal)) * 0.12;
      } else if (facadePattern > 3.5 && facadePattern < 4.5) {
        windowMask = facadeBand(cell.x, 0.32, 0.5, aa.x) * facadeBand(cell.y, 0.1, 0.85, aa.y);
      } else if (facadePattern > 4.5) {
        windowMask = facadeBand(cell.x, 0.27, 0.65, aa.x) * facadeBand(cell.y, 0.25, 0.65, aa.y);
      }
      windowMask *= 1.0 - smoothstep(0.35, 0.7, abs(vFacadeNormal.y));
      float room = facadeHash(floor(grid) + vec2(facadeSeed + vInstanceSeed, facadeSeed * 0.13));
      float occupancy = step(1.0 - facadeOccupancy, room);
      vec3 lamp = mix(facadeCool, facadeWarm, step(1.0 - facadeWarmth, facadeHash(floor(grid) + 43.0)));
      totalEmissiveRadiance += lamp * occupancy * windowMask * facadeBrightness;
      diffuseColor.rgb *= mix(0.86, 1.0, windowMask);`,
        );
    },
    [uniforms],
  );
  return (
    <meshStandardMaterial
      ref={materialRef}
      color={color}
      metalness={appearance?.metalness ?? 0.28}
      roughness={appearance?.roughness ?? 0.37}
      onBeforeCompile={compile}
      customProgramCacheKey={() => "skyline-role-facades-v2"}
    />
  );
}
