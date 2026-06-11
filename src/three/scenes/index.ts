"use client";

import * as THREE from "three";
import { registerScene, type StageScene } from "../stage";
import { disposeObject, lerpCamera, makeGlowTexture, makeParticles, makeTextSprite } from "../utils";

function baseScene(fog?: { color: number; near: number; far: number }) {
  const scene = new THREE.Scene();
  if (fog) scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 14);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 8);
  scene.add(key);
  return { scene, camera };
}

/* ------------------------------------------------------------------ */
/* HUB: schwebende 3D-Game-Cards mit Parallax-Tilt                     */
/* ------------------------------------------------------------------ */
registerScene("hub", (payload): StageScene => {
  const { scene, camera } = baseScene();
  const cards = (payload.cards as { name: string; color: string }[] | undefined) ?? [];
  const group = new THREE.Group();
  scene.add(group);
  scene.add(makeParticles(260, 60, "#8a88ff", 0.5));

  const meshes: { mesh: THREE.Group; seed: number }[] = [];
  cards.slice(0, 14).forEach((card, i) => {
    const cardGroup = new THREE.Group();
    const geometry = new THREE.BoxGeometry(2.4, 3.2, 0.18);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(card.color),
      roughness: 0.35,
      metalness: 0.15,
      emissive: new THREE.Color(card.color),
      emissiveIntensity: 0.12,
    });
    cardGroup.add(new THREE.Mesh(geometry, material));
    const label = makeTextSprite(card.name.slice(0, 2).toUpperCase(), { color: "#0e0e10", font: "800 150px sans-serif" });
    label.scale.setScalar(1.6);
    label.position.z = 0.2;
    cardGroup.add(label);

    const angle = (i / Math.max(cards.length, 1)) * Math.PI * 2;
    const radius = 7 + (i % 3) * 2.6;
    cardGroup.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.7) * 3.4, -4 - (i % 5) * 2.2);
    cardGroup.rotation.set(Math.random() * 0.4 - 0.2, Math.random() * 0.6 - 0.3, Math.random() * 0.2 - 0.1);
    group.add(cardGroup);
    meshes.push({ mesh: cardGroup, seed: Math.random() * 100 });
  });

  return {
    scene,
    camera,
    update(dt, t, ctx) {
      lerpCamera(camera, ctx.pointer, 2.2);
      group.rotation.y += dt * 0.03;
      for (const { mesh, seed } of meshes) {
        mesh.position.y += Math.sin(t * 0.6 + seed) * dt * 0.35;
        mesh.rotation.y += dt * 0.15;
        // depth shift: Karten driften leicht auf den Pointer zu
        mesh.rotation.x += (ctx.pointer.y * 0.25 - mesh.rotation.x) * dt;
      }
    },
    dispose: () => disposeObject(scene),
  };
});

/* ------------------------------------------------------------------ */
/* LOBBY: Avatar-Orbs im Kreis, pulsieren bei Beitritt                 */
/* ------------------------------------------------------------------ */
registerScene("lobby", (payload): StageScene => {
  const { scene, camera } = baseScene();
  camera.position.set(0, 4, 13);
  const accent = (payload.accent as string) ?? "#c8f135";
  scene.add(makeParticles(200, 50, accent, 0.45));

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.05, 12, 120),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.6;
  scene.add(ring);

  const orbGroup = new THREE.Group();
  scene.add(orbGroup);
  let orbCount = -1;
  let pulse = 0;

  const rebuild = (players: { name: string; hue: number }[]) => {
    disposeObject(orbGroup);
    orbGroup.clear();
    players.forEach((player, i) => {
      const angle = (i / Math.max(players.length, 1)) * Math.PI * 2;
      const color = new THREE.Color(`hsl(${player.hue}, 80%, 60%)`);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 32, 32),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 })
      );
      orb.position.set(Math.cos(angle) * 5.2, 0, Math.sin(angle) * 5.2);
      const label = makeTextSprite(player.name.slice(0, 2).toUpperCase(), { color: "#fff", font: "800 130px sans-serif" });
      label.scale.setScalar(1.1);
      label.position.copy(orb.position).y += 1.3;
      orbGroup.add(orb, label);
    });
  };

  return {
    scene,
    camera,
    update(dt, t, ctx) {
      const players = (ctx.payload.players as { name: string; hue: number }[] | undefined) ?? [];
      if (players.length !== orbCount) {
        if (orbCount >= 0 && players.length > orbCount) pulse = 1;
        orbCount = players.length;
        rebuild(players);
      }
      if (ctx.pulses.includes("join")) pulse = 1;
      pulse = Math.max(0, pulse - dt * 1.4);
      orbGroup.rotation.y += dt * 0.25;
      orbGroup.children.forEach((child, i) => {
        child.position.y = Math.sin(t * 1.4 + i) * 0.35 + (child.type === "Sprite" ? 1.3 : 0);
        if (child.type === "Mesh") child.scale.setScalar(1 + pulse * 0.45 * Math.sin(pulse * Math.PI));
      });
      ring.scale.setScalar(1 + pulse * 0.1);
      lerpCamera(camera, ctx.pointer, 1.6);
      camera.position.y += (4 - camera.position.y) * 0.02;
    },
    dispose: () => disposeObject(scene),
  };
});

/* ------------------------------------------------------------------ */
/* RESULTS: Konfetti-Partikel + 3D-Trophäe                             */
/* ------------------------------------------------------------------ */
registerScene("results", (payload): StageScene => {
  const { scene, camera } = baseScene();
  camera.position.set(0, 1.5, 11);
  const accent = (payload.accent as string) ?? "#ffc24d";

  // Trophäe aus Primitiven
  const trophy = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc24d, metalness: 0.9, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.3 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.85, 2.1, 40), gold);
  cup.position.y = 1.6;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.1, 24), gold);
  stem.position.y = 0;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.4, 32), gold);
  foot.position.y = -0.7;
  const handleL = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 16, 40, Math.PI), gold);
  handleL.position.set(-1.5, 1.8, 0);
  handleL.rotation.z = Math.PI / 2;
  const handleR = handleL.clone();
  handleR.position.x = 1.5;
  handleR.rotation.z = -Math.PI / 2;
  trophy.add(cup, stem, foot, handleL, handleR);
  trophy.position.y = -1;
  scene.add(trophy);

  const spot = new THREE.PointLight(new THREE.Color(accent), 60, 40);
  spot.position.set(0, 6, 4);
  scene.add(spot);

  // Konfetti
  const COUNT = 600;
  const colors = ["#ff5c4d", "#4dc9ff", "#c8f135", "#ffc24d", "#b06bff", "#ff6bb5"];
  const confetti = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.22, 0.34),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true }),
    COUNT
  );
  const velocities: { v: THREE.Vector3; spin: number }[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    dummy.position.set((Math.random() - 0.5) * 24, 8 + Math.random() * 14, (Math.random() - 0.5) * 12);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    confetti.setMatrixAt(i, dummy.matrix);
    confetti.setColorAt(i, color.set(colors[i % colors.length]));
    velocities.push({ v: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(1.4 + Math.random() * 2.2), 0), spin: (Math.random() - 0.5) * 4 });
  }
  scene.add(confetti);
  const positions: THREE.Matrix4 = new THREE.Matrix4();

  return {
    scene,
    camera,
    update(dt, t, ctx) {
      trophy.rotation.y += dt * 0.7;
      trophy.position.y = -1 + Math.sin(t * 1.2) * 0.2;
      for (let i = 0; i < COUNT; i++) {
        confetti.getMatrixAt(i, positions);
        positions.decompose(dummy.position, dummy.quaternion, dummy.scale);
        const { v, spin } = velocities[i];
        dummy.position.addScaledVector(v, dt);
        dummy.rotation.set(dummy.rotation.x + spin * dt, dummy.rotation.y + spin * dt * 0.7, 0);
        if (dummy.position.y < -9) dummy.position.y = 9 + Math.random() * 6;
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
      lerpCamera(camera, ctx.pointer, 1.4);
      camera.position.y += (1.5 - camera.position.y) * 0.02;
    },
    dispose: () => disposeObject(scene),
  };
});

/* ------------------------------------------------------------------ */
/* WERWOLF: Vollmond-Nachtszene mit Partikelsternen & Nebel            */
/* ------------------------------------------------------------------ */
registerScene("werwolf", (): StageScene => {
  const { scene, camera } = baseScene({ color: 0x05060f, near: 10, far: 60 });
  camera.position.set(0, 1, 16);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 48, 48),
    new THREE.MeshStandardMaterial({ color: 0xf5f2e0, emissive: 0xc9c4a0, emissiveIntensity: 0.55, roughness: 0.95 })
  );
  moon.position.set(5.5, 4.5, -14);
  scene.add(moon);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture("#e8e2c0"), transparent: true, opacity: 0.55, depthWrite: false }));
  halo.scale.setScalar(16);
  halo.position.copy(moon.position);
  scene.add(halo);

  scene.add(makeParticles(500, 90, "#bcd2ff", 0.4));
  const fireflies = makeParticles(40, 26, "#ffd75e", 0.9);
  scene.add(fireflies);

  const moonlight = new THREE.PointLight(0xbac8ff, 35, 80);
  moonlight.position.copy(moon.position);
  scene.add(moonlight);

  // Silhouetten-Hügel
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(18, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x05060c })
  );
  hill.position.set(0, -19.5, -6);
  scene.add(hill);

  return {
    scene,
    camera,
    update(dt, t, ctx) {
      fireflies.rotation.y += dt * 0.06;
      fireflies.position.y = Math.sin(t * 0.5) * 0.6;
      halo.material.opacity = 0.45 + Math.sin(t * 0.8) * 0.1;
      lerpCamera(camera, ctx.pointer, 1.8);
      camera.position.y += (1 - camera.position.y) * 0.02;
    },
    dispose: () => disposeObject(scene),
  };
});

/* ------------------------------------------------------------------ */
/* FLOATERS: generische Ambient-Szene pro Spiel                        */
/* payload: { items: string[], colors: string[], accent, density }     */
/* ------------------------------------------------------------------ */
registerScene("floaters", (payload): StageScene => {
  const { scene, camera } = baseScene();
  const items = (payload.items as string[] | undefined) ?? ["?"];
  const colors = (payload.colors as string[] | undefined) ?? ["#c8f135"];
  const density = (payload.density as number | undefined) ?? 26;
  const accent = (payload.accent as string | undefined) ?? colors[0];

  scene.add(makeParticles(220, 60, accent, 0.5));
  const group = new THREE.Group();
  scene.add(group);

  const floaters: { obj: THREE.Object3D; seed: number; speed: number }[] = [];
  for (let i = 0; i < density; i++) {
    const text = items[i % items.length];
    const sprite = makeTextSprite(text, {
      color: colors[i % colors.length],
      font: "800 150px 'Cabinet Grotesk', sans-serif",
    });
    const scale = 1 + Math.random() * 2.2;
    sprite.scale.setScalar(scale);
    sprite.position.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 20, -2 - Math.random() * 16);
    (sprite.material as THREE.SpriteMaterial).opacity = 0.25 + Math.random() * 0.5;
    group.add(sprite);
    floaters.push({ obj: sprite, seed: Math.random() * 100, speed: 0.3 + Math.random() * 0.7 });
  }

  return {
    scene,
    camera,
    update(dt, t, ctx) {
      for (const f of floaters) {
        f.obj.position.y += Math.sin(t * f.speed + f.seed) * dt * 0.5;
        f.obj.position.x += Math.cos(t * f.speed * 0.6 + f.seed) * dt * 0.3;
      }
      group.rotation.z = Math.sin(t * 0.06) * 0.04;
      lerpCamera(camera, ctx.pointer, 2);
      if (ctx.pulses.includes("burst")) {
        for (const f of floaters) f.obj.position.z -= 1.5;
      }
      for (const f of floaters) f.obj.position.z = Math.min(f.obj.position.z + dt * 0.4, -2);
    },
    dispose: () => disposeObject(scene),
  };
});
