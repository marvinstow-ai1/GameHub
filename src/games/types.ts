import type React from "react";
import type { GameSession, PlayerInfo, SessionStatus } from "@/lib/types";

/**
 * Phasen-Konvention: LOBBY → RUNNING (erste Spielphase) → … → RESULTS.
 * Jedes Spiel definiert seine eigenen Zwischen-Phasen.
 */
export type GamePhase = string;
export const PHASE_LOBBY: GamePhase = "LOBBY";
export const PHASE_RESULTS: GamePhase = "RESULTS";

export type GameState = Record<string, unknown>;

export interface GameAction {
  type: string;
  data?: unknown;
  /** user_id des Absenders */
  from: string;
  ts: number;
}

export interface CommitPatch {
  state?: GameState | ((current: GameState) => GameState);
  phase?: GamePhase;
  status?: SessionStatus;
}

/** Frischer Stand, mit dem der Host eine Aktion verarbeitet (nie veraltet). */
export interface HostSnapshot {
  state: GameState;
  phase: GamePhase;
  status: SessionStatus;
}

/** Laufzeit-Kontext, den jedes Spiel als Props bekommt. */
export interface GameCtx {
  session: GameSession;
  players: PlayerInfo[];
  self: PlayerInfo;
  isHost: boolean;
  phase: GamePhase;
  state: GameState;
  /** Nur der Host schreibt State/Phase in die DB – alle anderen sehen das Update via Realtime. */
  commit: (patch: CommitPatch) => Promise<void>;
  /** Spieler-Aktion an den Host schicken (Broadcast, kommt auch bei sich selbst an). */
  send: (type: string, data?: unknown) => void;
  /**
   * Host: Aktionen aller Spieler verarbeiten. Aktionen laufen seriell durch
   * eine Queue; `snap` enthält immer den aktuellsten State/Phase.
   */
  onHostAction: (handler: (action: GameAction, snap: HostSnapshot) => void | Promise<void>) => () => void;
  /** Ephemerer Broadcast an ALLE Clients (z.B. Buzzer-Blitz, Zeichen-Strokes). */
  onEvent: (handler: (event: GameAction) => void) => () => void;
  sendEvent: (type: string, data?: unknown) => void;
  /** Spiel beenden: Gewinner + finale Scores, bumpt Stats, Phase → RESULTS. */
  endGame: (winnerIds: string[], scores?: Record<string, number>) => Promise<void>;
  /** Session löschen (Lobby schließen / Spiel abbrechen). */
  closeSession: () => Promise<void>;
  /** Zufälligen Content aus einer Seed-Tabelle ziehen (truth_dare, quiz_questions, …). */
  fetchContent: <T = Record<string, unknown>>(table: string, count: number) => Promise<T[]>;
}

export interface GameProps {
  ctx: GameCtx;
}

export interface GameModule {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  themeColor: string;
  /** Emoji/Kurzlabel für Cards & 3D-Szene */
  icon: string;
  phases: GamePhase[];
  component: React.FC<GameProps>;
  /** ID einer registrierten Three.js-Szene + payload (Ambiente pro Spiel) */
  threeScene?: { id: string; payload?: Record<string, unknown> };
}
