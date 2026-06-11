"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getSceneFactory, useStage, type StageScene } from "./stage";
import "./scenes";

/**
 * Globaler Three.js-Layer: ein Canvas hinter der gesamten UI.
 * Szenen werden über useStage().setScene(id, payload) getauscht.
 * Respektiert prefers-reduced-motion, Tab-Sichtbarkeit, Resize & DPR.
 */
export function ThreeStage() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    let active: StageScene | null = null;
    let activeId: string | null = null;
    let raf = 0;
    let last = performance.now();
    let running = true;
    const pointer = { x: 0, y: 0 };
    const size = { w: window.innerWidth, h: window.innerHeight };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applySize = () => {
      size.w = window.innerWidth;
      size.h = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size.w, size.h);
      if (active) {
        active.camera.aspect = size.w / size.h;
        active.camera.updateProjectionMatrix();
      }
    };
    applySize();

    const swapScene = (id: string | null, payload: Record<string, unknown>) => {
      if (active) {
        active.dispose();
        active = null;
      }
      activeId = id;
      if (!id) return;
      const factory = getSceneFactory(id);
      if (!factory) return;
      active = factory(payload);
      active.camera.aspect = size.w / size.h;
      active.camera.updateProjectionMatrix();
      if (reducedMotion.matches) renderer.render(active.scene, active.camera);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!running || !active) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      // Bei reduced motion: statisches Einzelbild, keine Animation
      if (reducedMotion.matches) return;
      const { payload, drainPulses } = useStage.getState();
      active.update(dt, now / 1000, { pointer, size, pulses: drainPulses(), payload });
      renderer.render(active.scene, active.camera);
    };

    const unsubscribe = useStage.subscribe((state, prev) => {
      if (state.sceneId !== activeId) swapScene(state.sceneId, state.payload);
      else if (state.payload !== prev.payload && active) {
        // payload-Updates ohne Szenenwechsel werden im update()-ctx sichtbar
      }
    });
    swapScene(useStage.getState().sceneId, useStage.getState().payload);

    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / size.w) * 2 - 1;
      pointer.y = (e.clientY / size.h) * 2 - 1;
    };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      last = performance.now();
    };
    const onMotionChange = () => {
      if (active) renderer.render(active.scene, active.camera);
    };

    window.addEventListener("resize", applySize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onMotionChange);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", applySize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotionChange);
      if (active) active.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div id="three-stage" ref={mountRef} aria-hidden="true" />;
}

/** Setzt die Hintergrund-Szene, solange die Komponente gemountet ist. */
export function useStageScene(id: string | null, payload?: Record<string, unknown>) {
  const setScene = useStage((s) => s.setScene);
  const json = JSON.stringify(payload ?? {});
  useEffect(() => {
    setScene(id, JSON.parse(json));
    return () => setScene(null);
  }, [id, json, setScene]);
}
