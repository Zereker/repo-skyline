import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";

// Labels project into DOM, so collision must be resolved in screen space per frame.
const occupied: Array<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> = [];
let occupiedFrame = -1;

/** Project a local DOM label without remote fonts or a second React root. */
export default function DistrictLabel({
  path,
  position,
  variant = "zone",
  subtitle,
}: {
  path: string;
  position: [number, number, number];
  variant?: "zone" | "landmark";
  subtitle?: string;
}) {
  const { gl, camera, size } = useThree();
  const element = useRef<HTMLDivElement | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    const label = document.createElement("div");
    label.className =
      variant === "landmark" ? "landmark-label" : "district-label";
    if (variant === "landmark" && subtitle) {
      const name = document.createElement("strong");
      name.textContent = path;
      const zone = document.createElement("small");
      zone.textContent = subtitle;
      label.append(name, zone);
    } else {
      label.textContent = path;
    }
    label.style.pointerEvents = "none";
    label.setAttribute("aria-hidden", "true");
    gl.domElement.parentElement?.appendChild(label);
    element.current = label;
    return () => {
      label.remove();
      element.current = null;
    };
  }, [gl, path, variant, subtitle]);
  useFrame((state) => {
    const label = element.current;
    if (!label) return;
    const frame = Math.round(state.clock.elapsedTime * 60);
    if (frame !== occupiedFrame) {
      occupiedFrame = frame;
      occupied.length = 0;
    }
    point.set(...position).project(camera);
    const visible = point.z >= -1 && point.z <= 1;
    const x = ((point.x + 1) * size.width) / 2;
    const y = ((1 - point.y) * size.height) / 2;
    label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    // Keep the element measurable; hiding it would collapse its box and defeat collision checks.
    label.style.display = "block";
    label.style.visibility = visible ? "visible" : "hidden";
    if (!visible) return;
    const width = label.offsetWidth;
    const height = label.offsetHeight;
    const rect = {
      left: x - width / 2,
      top: y - height / 2,
      right: x + width / 2,
      bottom: y + height / 2,
    };
    const collides = occupied.some(
      (other) =>
        rect.left < other.right &&
        rect.right > other.left &&
        rect.top < other.bottom &&
        rect.bottom > other.top,
    );
    label.style.visibility = collides ? "hidden" : "visible";
    if (!collides) occupied.push(rect);
  });
  return null;
}
