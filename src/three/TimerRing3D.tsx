"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { disposeObject } from "./utils";

/**
 * Animierter 3D-Timer-Ring. Eigenes kleines Canvas, damit er als
 * UI-Element überall platzierbar ist. remainingMs/totalMs steuern den Arc.
 */
export function TimerRing3D({
  endsAt,
  totalMs,
  size = 120,
  color = "#c8f135",
  onDone,
}: {
  endsAt: number;
  totalMs: number;
  size?: number;
  color?: string;
  onDone?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    doneRef.current = false;
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 2.2, 6.5);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const light = new THREE.PointLight(0xffffff, 30, 30);
    light.position.set(3, 4, 4);
    scene.add(light);

    const ringColor = new THREE.Color(color);
    const track = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.12, 16, 80),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, transparent: true, opacity: 0.45 })
    );
    scene.add(track);

    const arcMaterial = new THREE.MeshStandardMaterial({
      color: ringColor,
      emissive: ringColor,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    let arc: THREE.Mesh | null = null;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    // rAF pausiert in Hintergrund-Tabs – onDone muss trotzdem feuern (z.B. beim Host)
    const fireDone = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };
    const doneInterval = setInterval(() => {
      if (endsAt - Date.now() <= 0) fireDone();
    }, 500);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const remaining = Math.max(0, endsAt - Date.now());
      const frac = totalMs > 0 ? remaining / totalMs : 0;

      if (arc) {
        arc.geometry.dispose();
        scene.remove(arc);
        arc = null;
      }
      if (frac > 0.003) {
        arc = new THREE.Mesh(new THREE.TorusGeometry(2, 0.16, 16, 80, Math.PI * 2 * frac), arcMaterial);
        arc.rotation.z = Math.PI / 2;
        scene.add(arc);
      }
      const urgency = frac < 0.2 ? 1 : 0;
      arcMaterial.color.set(frac < 0.2 ? "#ff5c4d" : color);
      arcMaterial.emissive.set(frac < 0.2 ? "#ff5c4d" : color);
      const t = performance.now() / 1000;
      if (!reduced) {
        scene.rotation.y = Math.sin(t * 0.8) * 0.25;
        scene.scale.setScalar(1 + urgency * Math.sin(t * 8) * 0.04);
      }
      if (labelRef.current) labelRef.current.textContent = `${Math.ceil(remaining / 1000)}`;
      renderer.render(scene, camera);

      if (remaining <= 0) fireDone();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(doneInterval);
      if (arc) {
        arc.geometry.dispose();
        scene.remove(arc);
      }
      disposeObject(scene);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [endsAt, totalMs, size, color]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
      <span ref={labelRef} className="display relative text-2xl font-bold tabular-nums" />
    </div>
  );
}
