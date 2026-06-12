"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, Chip, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, PlayerVote, SharedTimer, WaitingFor, clearedTimer, timerFields, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

type Role = "werwolf" | "seherin" | "hexe" | "dorf";

interface WerwolfState {
  roles: Record<string, Role>;
  alive: string[];
  round: number;
  wolfVotes: Record<string, string>;
  seerTarget?: string | null;
  seerDone?: boolean;
  witchHealUsed?: boolean;
  witchPoisonUsed?: boolean;
  witchDone?: boolean;
  witchPoisonTarget?: string | null;
  nightVictims?: string[];
  dayVotes: Record<string, string>;
  lastLynched?: string | null;
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

const ROLE_INFO: Record<Role, { name: string; icon: string; desc: string }> = {
  werwolf: { name: "Werwolf", icon: "🐺", desc: "Wähle nachts mit deinem Rudel ein Opfer. Tagsüber: bloß nicht auffliegen." },
  seherin: { name: "Seherin", icon: "🔮", desc: "Du darfst jede Nacht die Rolle eines Spielers ansehen." },
  hexe: { name: "Hexe", icon: "🧪", desc: "Ein Heiltrank, ein Gifttrank – jeweils einmal pro Spiel." },
  dorf: { name: "Dorfbewohner", icon: "🏡", desc: "Finde die Werwölfe und stimme sie tagsüber an den Galgen." },
};

function assignRoles(playerIds: string[]): Record<string, Role> {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const roles: Record<string, Role> = {};
  const wolves = Math.max(1, Math.floor(shuffled.length / 4));
  shuffled.forEach((id, i) => {
    if (i < wolves) roles[id] = "werwolf";
    else if (i === wolves) roles[id] = "seherin";
    else if (i === wolves + 1 && shuffled.length >= 7) roles[id] = "hexe";
    else roles[id] = "dorf";
  });
  return roles;
}

function checkWin(state: WerwolfState): { winners: string[]; team: string } | null {
  const aliveWolves = state.alive.filter((id) => state.roles[id] === "werwolf");
  const aliveVillage = state.alive.filter((id) => state.roles[id] !== "werwolf");
  if (aliveWolves.length === 0)
    return { winners: Object.keys(state.roles).filter((id) => state.roles[id] !== "werwolf"), team: "Dorf" };
  if (aliveWolves.length >= aliveVillage.length)
    return { winners: Object.keys(state.roles).filter((id) => state.roles[id] === "werwolf"), team: "Werwölfe" };
  return null;
}

function RoleCard({ role, revealed, onFlip }: { role: Role; revealed: boolean; onFlip: () => void }) {
  const info = ROLE_INFO[role];
  return (
    <div className="card-3d mx-auto h-64 w-44 cursor-pointer" onClick={onFlip}>
      <div className="card-3d-inner relative h-full w-full" style={{ transform: revealed ? "rotateY(180deg)" : "none" }}>
        <div className="card-face absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-[var(--accent)] bg-[var(--bg-2)]">
          <span className="text-5xl">🌕</span>
          <p className="mt-3 px-4 text-center text-sm font-bold">Tippe, um deine Rolle zu sehen</p>
        </div>
        <div className="card-face card-back absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-[var(--accent)] p-4 text-center text-[#0e0e10]">
          <span className="text-5xl">{info.icon}</span>
          <p className="display mt-2 text-xl font-extrabold">{info.name}</p>
          <p className="mt-2 text-xs font-medium leading-relaxed">{info.desc}</p>
        </div>
      </div>
    </div>
  );
}

function Werwolf({ ctx }: GameProps) {
  const state = ctx.state as WerwolfState;
  const { phase, self, isHost, players } = ctx;
  const [cardRevealed, setCardRevealed] = useState(false);
  const initRef = useRef(false);

  const myRole = state.roles?.[self.id];
  const amAlive = state.alive?.includes(self.id);
  const alivePlayers = useMemo(() => players.filter((p) => state.alive?.includes(p.id)), [players, state.alive]);

  // Host: Spiel initialisieren
  useEffect(() => {
    if (!isHost || phase !== "ROLES" || state.roles || initRef.current) return;
    initRef.current = true;
    ctx.commit({
      state: {
        roles: assignRoles(players.map((p) => p.id)),
        alive: players.map((p) => p.id),
        round: 1,
        wolfVotes: {},
        dayVotes: {},
      },
    });
  }, [isHost, phase, state.roles, players, ctx]);

  // Host: Phasen-Logik über Aktionen (seriell, immer frischer Snapshot)
  const isOnline = (id: string) => players.find((p) => p.id === id)?.online ?? false;

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as WerwolfState;
    if (!s.roles) return;

    const resolveWolves = (wolfVotes: Record<string, string>) => {
      const tally: Record<string, number> = {};
      Object.values(wolfVotes).forEach((t) => (tally[t] = (tally[t] ?? 0) + 1));
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      const victim = sorted[0]?.[0];
      const seerAlive = s.alive.some((id) => s.roles[id] === "seherin" && isOnline(id));
      const witchAlive = s.alive.some((id) => s.roles[id] === "hexe" && isOnline(id));
      ctx.commit({
        state: { ...s, wolfVotes, nightVictims: victim ? [victim] : [] },
        phase: seerAlive ? "NIGHT_SEER" : witchAlive ? "NIGHT_WITCH" : "DAY_REVEAL",
      });
    };

    if (action.type === "wolf-vote" && snap.phase === "NIGHT_WOLVES") {
      if (s.roles[action.from] !== "werwolf" || !s.alive.includes(action.from)) return;
      const wolfVotes = { ...s.wolfVotes, [action.from]: action.data as string };
      const wolves = s.alive.filter((id) => s.roles[id] === "werwolf");
      const allVoted = wolves.every((id) => wolfVotes[id] || !isOnline(id));
      if (allVoted) resolveWolves(wolfVotes);
      else ctx.commit({ state: { ...s, wolfVotes } });
    }
    if (action.type === "force-night" && snap.phase === "NIGHT_WOLVES") {
      resolveWolves(s.wolfVotes ?? {});
    }
    if (action.type === "seer-check" && snap.phase === "NIGHT_SEER") {
      if (s.roles[action.from] !== "seherin") return;
      ctx.commit({ state: { ...s, seerTarget: action.data as string, seerDone: true } });
    }
    if ((action.type === "seer-done" || action.type === "force-night") && snap.phase === "NIGHT_SEER") {
      const witchAlive = s.alive.some((id) => s.roles[id] === "hexe" && isOnline(id));
      ctx.commit({ state: { ...s, seerTarget: null }, phase: witchAlive ? "NIGHT_WITCH" : "DAY_REVEAL" });
    }
    if (action.type === "witch-act" && snap.phase === "NIGHT_WITCH") {
      if (s.roles[action.from] !== "hexe") return;
      const { heal, poison } = action.data as { heal: boolean; poison: string | null };
      let victims = [...(s.nightVictims ?? [])];
      if (heal && !s.witchHealUsed) victims = [];
      if (poison && !s.witchPoisonUsed) victims.push(poison);
      ctx.commit({
        state: {
          ...s,
          nightVictims: victims,
          witchHealUsed: s.witchHealUsed || heal,
          witchPoisonUsed: s.witchPoisonUsed || !!poison,
        },
        phase: "DAY_REVEAL",
      });
    }
    if (action.type === "force-night" && snap.phase === "NIGHT_WITCH") {
      ctx.commit({ state: { ...s }, phase: "DAY_REVEAL" });
    }
    if (action.type === "discuss-end" && snap.phase === "DAY_DISCUSS") {
      ctx.commit({ state: { ...s, ...clearedTimer() }, phase: "DAY_VOTE" });
    }
    if ((action.type === "day-vote" || action.type === "force-tally") && snap.phase === "DAY_VOTE") {
      const dayVotes =
        action.type === "day-vote" && s.alive.includes(action.from)
          ? { ...s.dayVotes, [action.from]: action.data as string }
          : { ...s.dayVotes };
      const allVoted = s.alive.every((id) => dayVotes[id] || !isOnline(id));
      if (action.type === "day-vote" && !allVoted) {
        ctx.commit({ state: { ...s, dayVotes } });
        return;
      }
      const tally: Record<string, number> = {};
      Object.values(dayVotes).forEach((t) => (tally[t] = (tally[t] ?? 0) + 1));
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      const lynched =
        sorted.length === 0 || (sorted.length > 1 && sorted[0][1] === sorted[1][1]) ? null : sorted[0][0];
      const alive = lynched ? s.alive.filter((id) => id !== lynched) : s.alive;
      const next: WerwolfState = { ...s, dayVotes, lastLynched: lynched, alive };
      const win = checkWin(next);
      if (win) {
        ctx.commit({ state: next });
        ctx.endGame(win.winners);
      } else {
        ctx.commit({ state: next, phase: "LYNCH_REVEAL" });
      }
    }
  });

  // Host: Übergänge per Button (funktionale Commits gegen frischen State)
  const goNight = () => {
    ctx.commit({
      state: (cur) => ({
        ...(cur as WerwolfState),
        round: ((cur as WerwolfState).round ?? 1) + 1,
        wolfVotes: {},
        dayVotes: {},
        nightVictims: [],
        seerTarget: null,
        ...clearedTimer(),
      }),
      phase: "NIGHT_WOLVES",
    });
  };
  const applyNight = async () => {
    const s = ctx.state as WerwolfState;
    const alive = s.alive.filter((id) => !(s.nightVictims ?? []).includes(id));
    const next = { ...s, alive };
    const win = checkWin(next);
    if (win) {
      await ctx.commit({ state: next });
      ctx.endGame(win.winners);
    } else {
      ctx.commit({ state: { ...next, ...timerFields(120) }, phase: "DAY_DISCUSS" });
    }
  };

  if (!state.roles || !myRole) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Rollen werden verteilt… 🌒</Panel>;
  }

  /* ---------- ROLES: Karte aufdecken ---------- */
  if (phase === "ROLES") {
    return (
      <div className="mx-auto max-w-md px-4 pt-8">
        <PhaseHeader icon="🌕" title="Deine Rolle" subtitle="Nur du siehst diese Karte. Tippe zum Aufdecken." />
        <RoleCard role={myRole} revealed={cardRevealed} onFlip={() => setCardRevealed(true)} />
        {isHost && (
          <Button className="mt-8 w-full" onClick={() => ctx.commit({ phase: "NIGHT_WOLVES" })}>
            🌙 Die Nacht beginnt
          </Button>
        )}
      </div>
    );
  }

  const dead = !amAlive;
  const deadBanner = dead && (
    <Chip className="mx-auto mb-4 flex w-fit">💀 Du bist tot – beobachte still weiter</Chip>
  );

  /* ---------- NACHT ---------- */
  if (phase === "NIGHT_WOLVES") {
    const isWolf = myRole === "werwolf" && amAlive;
    const candidates = alivePlayers.filter((p) => state.roles[p.id] !== "werwolf").map((p) => p.id);
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        {deadBanner}
        <PhaseHeader icon="🐺" title={`Nacht ${state.round}`} subtitle={isWolf ? "Wählt euer Opfer" : "Die Werwölfe erwachen…"} />
        {isWolf ? (
          <>
            <PlayerVote ctx={ctx} candidates={candidates} myVote={state.wolfVotes?.[self.id]} onVote={(t) => ctx.send("wolf-vote", t)} />
            <p className="mt-3 text-center text-xs text-[var(--fg-muted)]">
              Rudel: {alivePlayers.filter((p) => state.roles[p.id] === "werwolf").map((p) => p.username).join(", ")}
            </p>
          </>
        ) : (
          <p className="animate-pulse-soft text-center text-lg">Das Dorf schläft. 😴</p>
        )}
        <HostEscape ctx={ctx} label="Nacht-Phase überspringen (Wölfe reagieren nicht)" action="force-night" />
      </div>
    );
  }

  if (phase === "NIGHT_SEER") {
    const isSeer = myRole === "seherin" && amAlive;
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        {deadBanner}
        <PhaseHeader icon="🔮" title="Die Seherin erwacht" subtitle={isSeer ? "Wessen Rolle willst du sehen?" : "…und blickt in die Seelen."} />
        {isSeer ? (
          state.seerTarget ? (
            <>
              <Panel className="text-center">
                <p className="text-3xl">{ROLE_INFO[state.roles[state.seerTarget]].icon}</p>
                <p className="mt-2 font-bold">
                  {players.find((p) => p.id === state.seerTarget)?.username} ist {ROLE_INFO[state.roles[state.seerTarget]].name}
                </p>
              </Panel>
              <Button className="mt-4 w-full" onClick={() => ctx.send("seer-done")}>
                😴 Wieder einschlafen
              </Button>
            </>
          ) : (
            <PlayerVote ctx={ctx} candidates={alivePlayers.filter((p) => p.id !== self.id).map((p) => p.id)} onVote={(t) => ctx.send("seer-check", t)} />
          )
        ) : (
          <p className="animate-pulse-soft text-center text-lg">Das Dorf schläft. 😴</p>
        )}
        <HostEscape ctx={ctx} label="Nacht-Phase überspringen (Seherin reagiert nicht)" action="force-night" />
      </div>
    );
  }

  if (phase === "NIGHT_WITCH") {
    const isWitch = myRole === "hexe" && amAlive;
    const victim = state.nightVictims?.[0];
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        {deadBanner}
        <PhaseHeader icon="🧪" title="Die Hexe erwacht" subtitle={isWitch ? "Heilen? Vergiften?" : "…und braut ihre Tränke."} />
        {isWitch ? (
          <WitchPanel
            victimName={victim ? players.find((p) => p.id === victim)?.username : undefined}
            healUsed={!!state.witchHealUsed}
            poisonUsed={!!state.witchPoisonUsed}
            candidates={alivePlayers.filter((p) => p.id !== self.id)}
            onSubmit={(heal, poison) => ctx.send("witch-act", { heal, poison })}
          />
        ) : (
          <p className="animate-pulse-soft text-center text-lg">Das Dorf schläft. 😴</p>
        )}
        <HostEscape ctx={ctx} label="Nacht-Phase überspringen (Hexe reagiert nicht)" action="force-night" />
      </div>
    );
  }

  /* ---------- TAG ---------- */
  if (phase === "DAY_REVEAL") {
    const victims = state.nightVictims ?? [];
    return (
      <div className="mx-auto max-w-xl px-4 pt-8 text-center">
        <PhaseHeader icon="🌅" title="Der Morgen graut" />
        {victims.length === 0 ? (
          <Panel className="py-8"><p className="text-lg font-bold">Niemand ist gestorben. 🕊️</p></Panel>
        ) : (
          <Panel className="py-8">
            {victims.map((v) => (
              <p key={v} className="text-lg font-bold">
                💀 {players.find((p) => p.id === v)?.username} wurde gefunden…
              </p>
            ))}
          </Panel>
        )}
        {isHost && <Button className="mt-6" onClick={applyNight}>Weiter zur Diskussion</Button>}
      </div>
    );
  }

  if (phase === "DAY_DISCUSS") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-8 text-center">
        {deadBanner}
        <PhaseHeader icon="☀️" title="Diskussion" subtitle="Wer ist verdächtig? Redet!" />
        <div className="flex justify-center">
          <SharedTimer ctx={ctx} color="#8b7cff" onDone={() => ctx.send("discuss-end")} />
        </div>
        {isHost && (
          <Button variant="ghost" className="mt-6" onClick={() => ctx.send("discuss-end")}>
            Direkt abstimmen →
          </Button>
        )}
      </div>
    );
  }

  if (phase === "DAY_VOTE") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        {deadBanner}
        <PhaseHeader icon="🗳️" title="Abstimmung" subtitle="Wer soll gehängt werden?" />
        {amAlive ? (
          <PlayerVote
            ctx={ctx}
            candidates={alivePlayers.map((p) => p.id)}
            myVote={state.dayVotes?.[self.id]}
            onVote={(t) => ctx.send("day-vote", t)}
          />
        ) : (
          <p className="text-center text-[var(--fg-muted)]">Die Lebenden stimmen ab…</p>
        )}
        <div className="mt-4">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.dayVotes ?? {})} label="Es fehlen" />
        </div>
        <HostEscape ctx={ctx} label="Abstimmung jetzt auswerten" action="force-tally" />
      </div>
    );
  }

  if (phase === "LYNCH_REVEAL") {
    const lynched = state.lastLynched;
    return (
      <div className="mx-auto max-w-xl px-4 pt-8 text-center">
        <PhaseHeader icon="⚖️" title="Das Urteil" />
        <Panel className="py-8">
          {lynched ? (
            <>
              <p className="text-lg font-bold">{players.find((p) => p.id === lynched)?.username} wurde gehängt.</p>
              <p className="mt-2 text-3xl">{ROLE_INFO[state.roles[lynched]].icon}</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">…und war {ROLE_INFO[state.roles[lynched]].name}.</p>
            </>
          ) : (
            <p className="text-lg font-bold">Gleichstand – niemand wurde gehängt. 😮‍💨</p>
          )}
        </Panel>
        {isHost && <Button className="mt-6" onClick={goNight}>🌙 Nächste Nacht</Button>}
      </div>
    );
  }

  return null;
}

function WitchPanel({
  victimName,
  healUsed,
  poisonUsed,
  candidates,
  onSubmit,
}: {
  victimName?: string;
  healUsed: boolean;
  poisonUsed: boolean;
  candidates: { id: string; username: string; hue: number }[];
  onSubmit: (heal: boolean, poison: string | null) => void;
}) {
  const [heal, setHeal] = useState(false);
  const [poison, setPoison] = useState<string | null>(null);
  return (
    <Panel>
      <p className="text-center">
        {victimName ? <>Opfer dieser Nacht: <strong>{victimName}</strong></> : "Niemand wurde angegriffen."}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Button variant={heal ? "primary" : "ghost"} disabled={healUsed || !victimName} onClick={() => setHeal(!heal)}>
          💚 Heiltrank einsetzen {healUsed && "(verbraucht)"}
        </Button>
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--fg-muted)]">☠️ Gifttrank {poisonUsed && "(verbraucht)"}</p>
          {!poisonUsed && (
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPoison(poison === p.id ? null : p.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-xs cursor-pointer",
                    poison === p.id ? "border-coral bg-coral/20" : "border-[var(--line)]"
                  )}
                >
                  <Avatar name={p.username} hue={p.hue} size={32} />
                  <span className="truncate w-full text-center">{p.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => onSubmit(heal, poison)}>Nacht beenden</Button>
      </div>
    </Panel>
  );
}

export const werwolfModule: GameModule = {
  id: "werwolf",
  name: "Werwolf",
  description: "Das Dorf schläft, die Wölfe jagen. Soziale Deduktion mit Seherin & Hexe.",
  minPlayers: 5,
  maxPlayers: 18,
  themeColor: "#8b7cff",
  icon: "🐺",
  phases: ["ROLES", "NIGHT_WOLVES", "NIGHT_SEER", "NIGHT_WITCH", "DAY_REVEAL", "DAY_DISCUSS", "DAY_VOTE", "LYNCH_REVEAL", "RESULTS"],
  component: Werwolf,
  threeScene: { id: "werwolf" },
};
