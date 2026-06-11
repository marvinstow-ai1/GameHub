"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo } from "react";
import { TimerRing3D } from "@/three/TimerRing3D";
import { Avatar, Button, Chip, Panel, cn } from "@/components/ui";
import { useStage } from "@/three/stage";
import type { GameAction, GameCtx } from "./types";
import type { GameModule } from "./types";

/* ---------- Host-Logik: Aktionen abonnieren (nur als Host aktiv) ---------- */

export function useHostActions(ctx: GameCtx, handler: (action: GameAction) => void) {
  const { isHost, onAction } = ctx;
  useEffect(() => {
    if (!isHost) return;
    return onAction(handler);
    // handler bewusst nicht in deps – Spiele übergeben inline-Closures über aktuellem State
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, onAction, ctx.state, ctx.phase, ctx.players.length]);
}

/* ---------- Timer (geteilt über state.timerEnd / state.timerTotal) ---------- */

export function startTimer(ctx: GameCtx, seconds: number, extra?: Record<string, unknown>) {
  return ctx.commit({
    state: (s) => ({ ...s, ...extra, timerEnd: Date.now() + seconds * 1000, timerTotal: seconds * 1000 }),
    ...(extra && "phase" in extra ? { phase: extra.phase as string } : {}),
  });
}

export function SharedTimer({ ctx, color, onDone, size = 110 }: { ctx: GameCtx; color?: string; onDone?: () => void; size?: number }) {
  const end = ctx.state.timerEnd as number | undefined;
  const total = ctx.state.timerTotal as number | undefined;
  if (!end || !total) return null;
  return (
    <TimerRing3D
      endsAt={end}
      totalMs={total}
      size={size}
      color={color ?? "var-accent"}
      onDone={ctx.isHost ? onDone : undefined}
    />
  );
}

/* ---------- Lobby ---------- */

export function LobbyView({ ctx, module: mod, onStart }: { ctx: GameCtx; module: GameModule; onStart: () => void }) {
  const setScene = useStage((s) => s.setScene);
  const setPayload = useStage((s) => s.setPayload);
  const scenePlayers = useMemo(
    () => ctx.players.map((p) => ({ name: p.username, hue: p.hue })),
    [ctx.players]
  );
  useEffect(() => {
    setScene("lobby", { accent: mod.themeColor, players: scenePlayers });
  }, [setScene, mod.themeColor, scenePlayers]);
  useEffect(() => {
    setPayload({ accent: mod.themeColor, players: scenePlayers });
  }, [scenePlayers, setPayload, mod.themeColor]);

  const enough = ctx.players.length >= mod.minPlayers;
  const full = ctx.players.length > mod.maxPlayers;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 pt-10 text-center">
      <span className="text-5xl">{mod.icon}</span>
      <div>
        <h1 className="text-4xl font-extrabold">{mod.name}</h1>
        <p className="mt-2 text-[var(--fg-muted)]">{mod.description}</p>
      </div>
      <Panel className="w-full" glow>
        <p className="mb-3 text-sm font-semibold text-[var(--fg-muted)]">
          {ctx.players.length} Spieler · min. {mod.minPlayers}, max. {mod.maxPlayers}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <AnimatePresence>
            {ctx.players.map((p) => (
              <motion.div
                key={p.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="flex flex-col items-center gap-1"
              >
                <Avatar name={p.username} hue={p.hue} size={52} online={p.online} />
                <span className="max-w-20 truncate text-xs">{p.username}{p.id === ctx.session.host_id ? " 👑" : ""}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Panel>
      {ctx.isHost ? (
        <Button size="lg" disabled={!enough || full} onClick={onStart} className="w-full">
          {enough ? "Spiel starten" : `Noch ${mod.minPlayers - ctx.players.length} Spieler nötig…`}
        </Button>
      ) : (
        <Chip>Warte auf den Host…</Chip>
      )}
    </div>
  );
}

/* ---------- Results ---------- */

export function ResultsView({ ctx, module: mod, children }: { ctx: GameCtx; module: GameModule; children?: React.ReactNode }) {
  const setScene = useStage((s) => s.setScene);
  useEffect(() => {
    setScene("results", { accent: mod.themeColor });
  }, [setScene, mod.themeColor]);

  const winners = ctx.session.winner_ids ?? [];
  const ranked = [...ctx.players].sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 pt-10 text-center">
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="text-4xl font-extrabold"
      >
        🏆 Ergebnis
      </motion.h1>
      <div className="flex flex-wrap justify-center gap-4">
        {ctx.players
          .filter((p) => winners.includes(p.id))
          .map((p) => (
            <motion.div key={p.id} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center gap-2">
              <Avatar name={p.username} hue={p.hue} size={72} />
              <span className="display text-lg font-bold">{p.username}</span>
            </motion.div>
          ))}
        {winners.length === 0 && <Chip>Kein eindeutiger Sieger</Chip>}
      </div>
      {ranked.some((p) => p.score !== 0) && (
        <Panel className="w-full text-left">
          {ranked.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-[var(--line)] py-2 last:border-0">
              <span className="display w-6 font-bold text-[var(--fg-muted)]">{i + 1}.</span>
              <Avatar name={p.username} hue={p.hue} size={32} />
              <span className="flex-1 truncate">{p.username}</span>
              <span className="display font-bold tabular-nums">{p.score}</span>
            </div>
          ))}
        </Panel>
      )}
      {children}
      <Button variant="ghost" onClick={() => (window.location.href = `/groups/${ctx.session.group_id}`)}>
        Zurück zur Gruppe
      </Button>
    </div>
  );
}

/* ---------- Kleinteile ---------- */

export function PhaseHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: string }) {
  return (
    <motion.div
      key={title}
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mb-5 text-center"
    >
      {icon && <span className="text-3xl">{icon}</span>}
      <h2 className="text-2xl font-extrabold sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[var(--fg-muted)]">{subtitle}</p>}
    </motion.div>
  );
}

export function ScoreStrip({ ctx, scores }: { ctx: GameCtx; scores?: Record<string, number> }) {
  return (
    <div className="scrollbar-slim flex gap-2 overflow-x-auto py-2">
      {ctx.players.map((p) => (
        <Chip key={p.id} className={cn(!p.online && "opacity-40")}>
          <Avatar name={p.username} hue={p.hue} size={18} />
          <span className="max-w-24 truncate">{p.username}</span>
          <strong className="tabular-nums">{scores ? (scores[p.id] ?? 0) : p.score}</strong>
        </Chip>
      ))}
    </div>
  );
}

/** Zeigt, auf wen noch gewartet wird (Submit-Phasen). */
export function WaitingFor({ ctx, doneIds, label = "Warten auf" }: { ctx: GameCtx; doneIds: string[]; label?: string }) {
  const waiting = ctx.players.filter((p) => !doneIds.includes(p.id) && p.online);
  if (waiting.length === 0) return null;
  return (
    <p className="text-center text-sm text-[var(--fg-muted)]">
      {label}: {waiting.map((p) => p.username).join(", ")}
    </p>
  );
}

/** Abstimmung über Spieler */
export function PlayerVote({
  ctx,
  candidates,
  onVote,
  myVote,
  disabled,
  counts,
}: {
  ctx: GameCtx;
  candidates: string[];
  onVote: (targetId: string) => void;
  myVote?: string | null;
  disabled?: boolean;
  counts?: Record<string, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {ctx.players
        .filter((p) => candidates.includes(p.id))
        .map((p) => (
          <button
            key={p.id}
            disabled={disabled}
            onClick={() => onVote(p.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all cursor-pointer",
              myVote === p.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.02]"
                : "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]",
              disabled && "opacity-60 pointer-events-none"
            )}
          >
            <Avatar name={p.username} hue={p.hue} size={48} />
            <span className="max-w-full truncate text-sm font-semibold">{p.username}</span>
            {counts && <span className="display text-lg font-bold">{counts[p.id] ?? 0}</span>}
          </button>
        ))}
    </div>
  );
}
