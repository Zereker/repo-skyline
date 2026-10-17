import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export default function NightEffects() {
  const { gl, scene, camera, size } = useThree();
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: Math.min(4, gl.capabilities.maxSamples),
    });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.32, 0.6, 0.85);
    const output = new OutputPass();
    composer.addPass(render);
    composer.addPass(bloom);
    composer.addPass(output);
    return { composer, render, bloom, output };
  }, [gl, scene, camera]);
  useEffect(() => {
    pipeline.composer.setPixelRatio(Math.min(gl.getPixelRatio(), 1.25));
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, gl, size]);
  useEffect(
    () => () => {
      pipeline.render.dispose();
      pipeline.bloom.dispose();
      pipeline.output.dispose();
      pipeline.composer.dispose();
    },
    [pipeline],
  );
  useFrame((_, delta) => pipeline.composer.render(delta), 1);
  return null;
}
