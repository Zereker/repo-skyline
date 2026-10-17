import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, Color, Object3D, type InstancedMesh } from "three";

export type CityBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function BlueHourSky() {
  const uniforms = useMemo(
    () => ({
      zenith: { value: new Color("#050c20") },
      horizon: { value: new Color("#182c48") },
    }),
    [],
  );
  return (
    <mesh>
      <sphereGeometry args={[4000, 24, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`varying vec3 skyDirection; void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`
        uniform vec3 zenith; uniform vec3 horizon; varying vec3 skyDirection;
        void main() {
          vec3 direction = normalize(skyDirection);
          float elevation = max(0.0, direction.y);
          vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.55, elevation));
          float haze = pow(max(0.0, dot(direction, normalize(vec3(-1.0, 0.06, -1.0)))), 12.0);
          color += vec3(0.025, 0.01, 0.008) * haze * exp(-elevation * 8.0);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}
      />
    </mesh>
  );
}

function Traffic({ x, z, length }: { x: number; z: number; length: number }) {
  const ref = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    for (let i = 0; i < 36; i++) {
      const lane = i % 2;
      const progress =
        (((i / 36 + clock.elapsedTime * 0.009 * (lane ? 1 : -1)) % 1) + 1) % 1;
      object.position.set(x + (progress - 0.5) * length, 0.18, z + lane * 0.55);
      object.scale.set(0.35 + (i % 3) * 0.13, 0.035, 0.06);
      object.updateMatrix();
      ref.current.setMatrixAt(i, object.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, 36]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ffd7a0" toneMapped={false} />
    </instancedMesh>
  );
}

/** The river is scenery; every selectable tower remains a real repository file. */
export default function Waterfront({ bounds }: { bounds: CityBounds }) {
  const width = bounds.maxX - bounds.minX + 24;
  const depth = bounds.maxZ - bounds.minZ + 20;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const shoreZ = bounds.maxZ + 9;
  const riverWidth = Math.max(22, depth * 0.35);
  const bridgeX = bounds.minX - 7;
  return (
    <>
      <BlueHourSky />
      <mesh position={[centerX, -0.35, shoreZ - depth * 4]}>
        <boxGeometry args={[width * 16, 0.6, depth * 8]} />
        <meshStandardMaterial
          color="#101d2c"
          roughness={0.9}
          metalness={0.15}
        />
      </mesh>
      <mesh
        position={[centerX, -0.42, shoreZ + riverWidth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[width * 8, riverWidth]} />
        <MeshReflectorMaterial
          resolution={512}
          mirror={0.95}
          mixStrength={2.4}
          mixBlur={0.6}
          blur={[40, 12]}
          color="#78939f"
          metalness={0.25}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[centerX, -0.12, shoreZ - 1.5]}>
        <boxGeometry args={[width * 2.5, 0.35, 3]} />
        <meshStandardMaterial
          color="#3a3432"
          roughness={0.55}
          metalness={0.25}
        />
      </mesh>
      <mesh position={[centerX, 0.07, shoreZ - 0.12]}>
        <boxGeometry args={[width * 2.5, 0.07, 0.1]} />
        <meshBasicMaterial color="#ebbd7b" toneMapped={false} />
      </mesh>
      <mesh position={[centerX, 0.03, shoreZ - 3.4]}>
        <boxGeometry args={[width * 2.5, 0.09, 1.6]} />
        <meshStandardMaterial color="#070f19" roughness={0.45} />
      </mesh>
      <Traffic x={centerX} z={shoreZ - 3.7} length={width * 2.4} />
      <mesh position={[centerX, -0.12, shoreZ + riverWidth + 12]}>
        <boxGeometry args={[width * 8, 0.35, 24]} />
        <meshStandardMaterial color="#0c1725" roughness={0.7} />
      </mesh>
      <mesh position={[centerX, 0.02, shoreZ + riverWidth + 0.1]}>
        <boxGeometry args={[width * 8, 0.06, 0.13]} />
        <meshBasicMaterial color="#d8b185" toneMapped={false} />
      </mesh>
      <mesh position={[bridgeX, 0.5, shoreZ + riverWidth / 2]}>
        <boxGeometry args={[2.5, 0.35, riverWidth + 6]} />
        <meshStandardMaterial
          color="#263748"
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[bridgeX + side * 1.2, 0.78, shoreZ + riverWidth / 2]}
        >
          <boxGeometry args={[0.045, 0.055, riverWidth + 6]} />
          <meshBasicMaterial color="#edc792" toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: 36 }, (_, i) => {
        const x = centerX + (i / 35 - 0.5) * width * 2.3;
        return (
          <group key={i} position={[x, 0, shoreZ - 0.6]}>
            <mesh position={[0, 0.8, 0]}>
              <cylinderGeometry args={[0.025, 0.035, 1.6, 4]} />
              <meshStandardMaterial color="#576275" />
            </mesh>
            <mesh position={[0, 1.65, 0]}>
              <sphereGeometry args={[0.075, 6, 4]} />
              <meshBasicMaterial color="#ffe2b7" toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
