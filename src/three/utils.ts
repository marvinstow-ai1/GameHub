"use client";

import * as THREE from "three";

/** Sprite mit Text/Emoji über eine Canvas-Textur – günstig & überall einsetzbar. */
export function makeTextSprite(
  text: string,
  opts: { size?: number; color?: string; font?: string; bg?: string } = {}
): THREE.Sprite {
  const { size = 256, color = "#ffffff", font = "bold 160px 'Cabinet Grotesk', sans-serif", bg } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  return new THREE.Sprite(material);
}

/** Runde, weiche Glow-Textur für Partikel. */
export function makeGlowTexture(color = "#ffffff", size = 128): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.4, color + "88");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Sternen-/Partikelfeld als Points. */
export function makeParticles(count: number, spread: number, color: string, size = 0.6): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * spread;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: makeGlowTexture(color),
    color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) {
      const m = material as THREE.Material & { map?: THREE.Texture };
      m.map?.dispose();
      m.dispose();
    }
  });
}

export function lerpCamera(camera: THREE.PerspectiveCamera, pointer: { x: number; y: number }, strength = 1.2, ease = 0.04) {
  camera.position.x += (pointer.x * strength - camera.position.x) * ease;
  camera.position.y += (-pointer.y * strength * 0.6 - camera.position.y) * ease;
  camera.lookAt(0, 0, 0);
}
