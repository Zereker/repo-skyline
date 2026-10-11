import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";

/** Project a local DOM label without remote fonts or a second React root. */
export default function DistrictLabel({
  path,
  position,
}: {
  path: string;
  position: [number, number, number];
}) {
  const { gl, camera, size } = useThree();
  const element = useRef<HTMLDivElement | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    const label = document.createElement("div");
    label.className = "district-label";
    label.textContent = path;
    label.style.pointerEvents = "none";
    label.setAttribute("aria-hidden", "true");
    gl.domElement.parentElement?.appendChild(label);
    element.current = label;
    return () => {
      label.remove();
      element.current = null;
    };
  }, [gl, path]);
  useFrame(() => {
    const label = element.current;
    if (!label) return;
    point.set(...position).project(camera);
    label.style.display = point.z >= -1 && point.z <= 1 ? "block" : "none";
    label.style.transform = `translate(-50%, -50%) translate(${((point.x + 1) * size.width) / 2}px, ${((1 - point.y) * size.height) / 2}px)`;
  });
  return null;
}
