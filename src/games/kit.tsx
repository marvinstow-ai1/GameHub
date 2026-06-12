"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TimerRing3D } from "@/three/TimerRing3D";
import { Avatar, Button, Chip, Input, Panel, cn } from "@/components/ui";
import { useStage } from "@/three/stage";
import type { GameAction, GameCtx, HostSnapshot, SettingDef } from "./types";
import type { GameModule } from "./types";

/* ---------- Host-Logik: Aktionen abonnieren (nur als Host aktiv) ---------- */

/**
 * Registriert den Host-Reducer. Aktionen kommen seriell aus der Queue,
 * `snap` ist dabei IMMER der frischeste Stand aus der Engine –
 * niemals den State aus dem Render-Closure für Spiellogik verwenden.
 */
export function useHostActions(
  ctx: GameCtx,
  handler: (action: GameAction, snap: HostSnapshot) => void | Promise<void>
) {
  const { isHost, onHostAction } = ctx;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!isHost) return;
    return onHostAction((action, snap) => handlerRef.current(action, snap));
  }, [isHost, onHostAction]);
}

/* ---------- Timer (geteilt über state.timerEnd / state.timerTotal) ---------- */

export function timerFields(seconds: number) {
  return { timerEnd: Date.now() + seconds * 1000, timerTotal: seconds * 1000 };
}

export function clearedTimer() {
  return { timerEnd: undefined, timerTotal: undefined };
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

/* ---------- Lobby-Einstellungen ---------- */

function TagsEditor({
  value,
  onChange,
  editable,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  editable: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <Chip key={tag} className="bg-[var(--accent-soft)]">
            {tag}
            {editable && (
              <button
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="ml-0.5 cursor-pointer font-bold text-[var(--fg-muted)] hover:text-coral"
                aria-label={`${tag} entfernen`}
              >
                ×
              </button>
            )}
          </Chip>
        ))}
        {value.length === 0 && <span className="text-xs text-[var(--fg-muted)]">–</span>}
      </div>
      {editable && (
        <div className="mt-2 flex gap-2">
          <Input
            value={draft}
            placeholder={placeholder ?? "Hinzufügen…"}
            maxLength={60}
            className="!py-2 text-sm"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <Button size="sm" variant="soft" onClick={add} disabled={!draft.trim()}>
            +
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Einstellungs-Panel in der Lobby: Der Host konfiguriert, alle sehen die
 * Werte live (State-Sync). Werte landen in state.settings.
 */
export function GameSettingsPanel({ ctx, module: mod }: { ctx: GameCtx; module: GameModule }) {
  if (!mod.settings || mod.settings.length === 0) return null;
  const editable = ctx.isHost;
  const current = (ctx.state.settings as Record<string, unknown> | undefined) ?? {};

  const update = (key: string, value: unknown) => {
    ctx.commit({
      state: (s) => ({ ...s, settings: { ...(s.settings as Record<string, unknown> | undefined), [key]: value } }),
    });
  };

  const valueOf = (def: SettingDef) => (current[def.key] === undefined ? def.default : current[def.key]);

  return (
    <Panel className="w-full text-left">
      <p className="display mb-3 text-sm font-extrabold uppercase tracking-wide text-[var(--fg-muted)]">
        ⚙️ Einstellungen {!editable && "(legt der Host fest)"}
      </p>
      <div className="flex flex-col gap-4">
        {mod.settings.map((def) => (
          <div key={def.key}>
            <label className="mb-1.5 block text-sm font-bold">{def.label}</label>
            {def.type === "number" && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step ?? 1}
                  value={valueOf(def) as number}
                  disabled={!editable}
                  onChange={(e) => update(def.key, parseInt(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="display w-16 text-right font-bold tabular-nums">
                  {valueOf(def) as number} {def.unit ?? ""}
                </span>
              </div>
            )}
            {def.type === "select" && (
              <div className="flex flex-wrap gap-1.5">
                {def.options.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={!editable}
                    onClick={() => update(def.key, opt.value)}
                    className={cn(
                      "display cursor-pointer rounded-xl border px-3 py-1.5 text-sm font-bold transition-all",
                      valueOf(def) === opt.value
                        ? "border-transparent bg-[var(--accent)] text-[#0e0e10]"
                        : "border-[var(--line)] text-[var(--fg-muted)] hover:border-[var(--accent)]",
                      !editable && "pointer-events-none"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {def.type === "toggle" && (
              <button
                disabled={!editable}
                onClick={() => update(def.key, !(valueOf(def) as boolean))}
                className={cn(
                  "relative h-7 w-12 cursor-pointer rounded-full transition-colors",
                  (valueOf(def) as boolean) ? "bg-[var(--accent)]" : "bg-[var(--bg-3)]",
                  !editable && "pointer-events-none opacity-70"
                )}
                aria-label={def.label}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                    (valueOf(def) as boolean) ? "left-6" : "left-1"
                  )}
                />
              </button>
            )}
            {def.type === "tags" && (
              <>
                <TagsEditor
                  value={valueOf(def) as string[]}
                  onChange={(next) => update(def.key, next)}
                  editable={editable}
                  placeholder={def.placeholder}
                />
                {def.help && <p className="mt-1 text-xs text-[var(--fg-muted)]">{def.help}</p>}
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
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
      <GameSettingsPanel ctx={ctx} module={mod} />
      {ctx.isHost ? (
        <>
          <Button size="lg" disabled={!enough || full} onClick={onStart} className="w-full">
            {enough ? "Spiel starten" : `Noch ${mod.minPlayers - ctx.players.length} Spieler nötig…`}
          </Button>
          <CloseSessionButton ctx={ctx} label="Lobby schließen" />
        </>
      ) : (
        <Chip>Warte auf den Host…</Chip>
      )}
    </div>
  );
}

/** Host/Owner: Session löschen und zurück zur Gruppe. */
export function CloseSessionButton({ ctx, label = "Spiel abbrechen" }: { ctx: GameCtx; label?: string }) {
  const router = useRouter();
  if (!ctx.isHost) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-[var(--fg-muted)]"
      onClick={async () => {
        if (!window.confirm("Session wirklich schließen? Das Spiel wird für alle beendet.")) return;
        await ctx.closeSession();
        router.push(`/groups/${ctx.session.group_id}`);
      }}
    >
      ✕ {label}
    </Button>
  );
}

/**
 * Notausgang für den Host, wenn auf Spieler gewartet wird, die nicht mehr
 * reagieren – löst eine Aktion aus, die die Runde trotzdem abschließt.
 */
export function HostEscape({ ctx, label, action }: { ctx: GameCtx; label: string; action: string }) {
  if (!ctx.isHost) return null;
  return (
    <button
      onClick={() => ctx.send(action)}
      className="display mx-auto mt-3 block cursor-pointer rounded-xl border border-dashed border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
    >
      ⏭ {label}
    </button>
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
