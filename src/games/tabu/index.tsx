"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, SharedTimer, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const TURN_SECONDS = 60;
const TURNS_PER_TEAM = 3;

interface TabuWord {
  word: string;
  taboo: string[];
}

interface TabuState {
  teams: { A: string[]; B: string[] };
  pool: TabuWord[];
  wordIndex: number;
  activeTeam: "A" | "B";
  explainerIndex: { A: number; B: number };
  turnCount: number;
  teamScores: { A: number; B: number };
  turnActive: boolean;
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

function TabuGame({ ctx }: GameProps) {
  const state = ctx.state as TabuState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);

  useEffect(() => {
    if (!isHost || phase !== "TURN" || state.teams || initRef.current) return;
    initRef.current = true;
    (async () => {
      const pool = await ctx.fetchContent<TabuWord>("tabu_words", 120);
      const shuffled = [...players.map((p) => p.id)].sort(() => Math.random() - 0.5);
      const half = Math.ceil(shuffled.length / 2);
      ctx.commit({
        state: {
          teams: { A: shuffled.slice(0, half), B: shuffled.slice(half) },
          pool,
          wordIndex: 0,
          activeTeam: "A",
          explainerIndex: { A: 0, B: 0 },
          turnCount: 0,
          teamScores: { A: 0, B: 0 },
          turnActive: false,
        },
      });
    })();
  }, [isHost, phase, state.teams, players, ctx]);

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as TabuState;
    if (!s.teams) return;
    const explainerId = s.teams[s.activeTeam][s.explainerIndex[s.activeTeam] % s.teams[s.activeTeam].length];

    const endTurn = () => {
      const turnCount = s.turnCount + 1;
      if (turnCount >= TURNS_PER_TEAM * 2) {
        const winningTeam = s.teamScores.A > s.teamScores.B ? "A" : s.teamScores.B > s.teamScores.A ? "B" : null;
        const winners = winningTeam ? s.teams[winningTeam] : [];
        const scores: Record<string, number> = {};
        for (const id of s.teams.A) scores[id] = s.teamScores.A;
        for (const id of s.teams.B) scores[id] = s.teamScores.B;
        ctx.endGame(winners, scores);
        return;
      }
      const nextTeam = s.activeTeam === "A" ? "B" : "A";
      ctx.commit({
        state: {
          ...s,
          turnActive: false,
          turnCount,
          activeTeam: nextTeam,
          explainerIndex: { ...s.explainerIndex, [s.activeTeam]: s.explainerIndex[s.activeTeam] + 1 },
          timerEnd: undefined,
          timerTotal: undefined,
        },
      });
    };

    if (action.type === "force-skip-turn") {
      endTurn();
      return;
    }
    if (action.type === "start-turn" && action.from === explainerId && !s.turnActive) {
      ctx.commit({
        state: { ...s, turnActive: true, timerEnd: Date.now() + TURN_SECONDS * 1000, timerTotal: TURN_SECONDS * 1000 },
      });
    }
    if (!s.turnActive) return;
    if (action.type === "end-turn") {
      endTurn();
    }
    if (action.type === "correct" && action.from === explainerId) {
      ctx.commit({
        state: {
          ...s,
          teamScores: { ...s.teamScores, [s.activeTeam]: s.teamScores[s.activeTeam] + 1 },
          wordIndex: s.wordIndex + 1,
        },
      });
    }
    if (action.type === "skip" && action.from === explainerId) {
      ctx.commit({ state: { ...s, wordIndex: s.wordIndex + 1 } });
    }
    // Gegnerteam buzzert bei Tabu-Verstoß: -1 und nächstes Wort
    if (action.type === "tabu-buzz" && s.teams[s.activeTeam === "A" ? "B" : "A"].includes(action.from)) {
      ctx.sendEvent("buzz-flash");
      ctx.commit({
        state: {
          ...s,
          teamScores: { ...s.teamScores, [s.activeTeam]: s.teamScores[s.activeTeam] - 1 },
          wordIndex: s.wordIndex + 1,
        },
      });
    }
  });

  if (!state.teams) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Teams werden gelost… 🤫</Panel>;
  }

  const myTeam: "A" | "B" = state.teams.A.includes(self.id) ? "A" : "B";
  const activeTeamIds = state.teams[state.activeTeam];
  const explainerId = activeTeamIds[state.explainerIndex[state.activeTeam] % activeTeamIds.length];
  const explainer = players.find((p) => p.id === explainerId);
  const iExplain = explainerId === self.id;
  const iDefend = myTeam !== state.activeTeam;
  const word = state.pool[state.wordIndex % state.pool.length];

  return (
    <div className="mx-auto max-w-xl px-4 pt-6">
      <div className="mb-4 flex items-center justify-center gap-4">
        {(["A", "B"] as const).map((team) => (
          <Panel key={team} className={cn("flex-1 py-3 text-center", state.activeTeam === team && "border-[var(--accent)]")}>
            <p className="text-xs font-bold text-[var(--fg-muted)]">
              Team {team} {myTeam === team && "(du)"}
            </p>
            <p className="display text-3xl font-extrabold">{state.teamScores[team]}</p>
          </Panel>
        ))}
      </div>

      <PhaseHeader
        icon="🤫"
        title={iExplain ? "Du erklärst!" : `${explainer?.username} erklärt für Team ${state.activeTeam}`}
        subtitle={`Zug ${state.turnCount + 1} von ${TURNS_PER_TEAM * 2}`}
      />

      {!state.turnActive ? (
        <div className="text-center">
          {iExplain ? (
            <Button size="lg" onClick={() => ctx.send("start-turn")}>⏱️ Runde starten ({TURN_SECONDS}s)</Button>
          ) : (
            <Chip className="mx-auto">Warte, bis {explainer?.username} startet…</Chip>
          )}
          <HostEscape ctx={ctx} label="Zug überspringen (Spieler reagiert nicht)" action="force-skip-turn" />
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-center">
            <SharedTimer ctx={ctx} color="#ff9f4d" size={84} onDone={() => ctx.send("end-turn")} />
          </div>

          {(iExplain || iDefend) && word ? (
            <motion.div key={state.wordIndex} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }}>
              <Panel glow className="text-center">
                <p className="display text-3xl font-extrabold uppercase">{word.word}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {word.taboo.map((t) => (
                    <Chip key={t} className="border-coral text-coral">🚫 {t}</Chip>
                  ))}
                </div>
                {iDefend && <p className="mt-3 text-xs text-[var(--fg-muted)]">Du verteidigst: Buzzer, wenn ein Tabu-Wort fällt!</p>}
              </Panel>
            </motion.div>
          ) : (
            <Panel className="py-10 text-center">
              <p className="text-xl font-bold">🗣️ Rate mit!</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">{explainer?.username} erklärt – ruf die Lösung laut rein!</p>
            </Panel>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            {iExplain && (
              <>
                <Button variant="ghost" onClick={() => ctx.send("skip")}>↷ Skip</Button>
                <Button onClick={() => ctx.send("correct")}>✓ Richtig (+1)</Button>
              </>
            )}
            {iDefend && (
              <Button variant="danger" className="col-span-2" onClick={() => ctx.send("tabu-buzz")}>
                🚨 TABU! (-1)
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const tabuModule: GameModule = {
  id: "tabu",
  name: "Alias / Tabu",
  description: "Erklär das Wort – aber sag bloß nicht die Tabuwörter. Team gegen Team.",
  minPlayers: 4,
  maxPlayers: 16,
  themeColor: "#ff9f4d",
  icon: "🤫",
  phases: ["TURN", "RESULTS"],
  component: TabuGame,
  threeScene: { id: "floaters", payload: { items: ["🤫", "🚫", "💬"], colors: ["#ff9f4d", "#ff5c4d"], density: 22 } },
};
