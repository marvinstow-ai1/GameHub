"use client";

import type * as THREE from "three";
import { create } from "zustand";

export interface SceneCtx {
  /** Normalisierte Pointer-Position (-1..1) */
  pointer: { x: number; y: number };
  size: { w: number; h: number };
  /** Events, die seit dem letzten Frame über pulse() reinkamen */
  pulses: string[];
  payload: Record<string, unknown>;
}

export interface StageScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (dt: number, t: number, ctx: SceneCtx) => void;
  dispose: () => void;
}

export type SceneFactory = (payload: Record<string, unknown>) => StageScene;

const registry = new Map<string, SceneFactory>();

export function registerScene(id: string, factory: SceneFactory) {
  registry.set(id, factory);
}

export function getSceneFactory(id: string) {
  return registry.get(id);
}

interface StageState {
  sceneId: string | null;
  payload: Record<string, unknown>;
  pulseQueue: string[];
  setScene: (id: string | null, payload?: Record<string, unknown>) => void;
  setPayload: (payload: Record<string, unknown>) => void;
  /** Schickt ein Einmal-Event an die aktive Szene (z.B. "join", "confetti"). */
  pulse: (event: string) => void;
  drainPulses: () => string[];
}

export const useStage = create<StageState>((set, get) => ({
  sceneId: null,
  payload: {},
  pulseQueue: [],
  setScene: (id, payload = {}) => set({ sceneId: id, payload }),
  setPayload: (payload) => set({ payload }),
  pulse: (event) => set({ pulseQueue: [...get().pulseQueue, event] }),
  drainPulses: () => {
    const q = get().pulseQueue;
    if (q.length) set({ pulseQueue: [] });
    return q;
  },
}));
