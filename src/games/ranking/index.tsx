"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Panel } from "@/components/ui";
import { PhaseHeader, ScoreStrip, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const TOTAL_ROUNDS = 5;

interface RankState {
  prompts: { text: string }[];
  round: number;
  /** rankings[uid] = geordnete Liste von Spieler-IDs (Platz 1 zuerst) */
  rankings: Record<string, string[]>;
  scores: Record<string, number>;
  lastResult?: { average: string[]; distances: Record<string, number> } | null;
  [key: string]: unknown;
}

/** Durchschnittsranking + Abstand jedes Spielers dazu (Spearman-Footrule). */
function evaluate(rankings: Record<string, string[]>, playerIds: string[]) {
  const avgPos: Record<string, number> = {};
  for (const id of playerIds) {
    const positions = Object.values(rankings).map((r) => r.indexOf(id)).filter((i) => i >= 0);
    avgPos[id] = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : playerIds.length;
  }
  const average = [...playerIds].sort((a, b) => avgPos[a] - avgPos[b]);
  const distances: Record<string, number> = {};
  for (const [uid, ranking] of Object.entries(rankings)) {
    distances[uid] = ranking.reduce((sum, id, i) => sum + Math.abs(i - average.indexOf(id)), 0);
  }
  return { average, distances };
}

function RankingBattle({ ctx }: GameProps) {
  const state = ctx.state as RankState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [order, setOrder] = useState<string[]>([]);
  const submitted = !!state.rankings?.[self.id];

  useEffect(() => {
    if (!isHost || phase !== "RANK" || state.prompts || initRef.current) return;
    initRef.current = true;
    (async () => {
      const prompts = await ctx.fetchContent<{ text: string }>("ranking_prompts", TOTAL_ROUNDS);
      ctx.commit({ state: { prompts, round: 0, rankings: {}, scores: {} } });
    })();
  }, [isHost, phase, state.prompts, ctx]);

  const [prevKey, setPrevKey] = useState("");
  const orderKey = `${state.round ?? 0}:${players.length}`;
  if (prevKey !== orderKey) {
    setPrevKey(orderKey);
    setOrder(players.map((p) => p.id));
  }

  useHostActions(ctx, (action) => {
    const s = ctx.state as RankState;
    if (action.type === "submit" && phase === "RANK") {
      const rankings = { ...s.rankings, [action.from]: action.data as string[] };
      const everyone = players.every((p) => rankings[p.id] || !p.online);
      if (everyone) {
        const result = evaluate(rankings, players.map((p) => p.id));
        const minDist = Math.min(...Object.values(result.distances));
        const scores = { ...s.scores };
        for (const [uid, d] of Object.entries(result.distances)) {
          if (d === minDist) scores[uid] = (scores[uid] ?? 0) + 100;
        }
        ctx.commit({ state: { ...s, rankings, scores, lastResult: result }, phase: "REVEAL" });
      } else {
        ctx.commit({ state: { ...s, rankings } });
      }
    }
  });

  const nextRound = () => {
    const s = ctx.state as RankState;
    const round = s.round + 1;
    if (round >= s.prompts.length) {
      const best = Math.max(...players.map((p) => s.scores[p.id] ?? 0));
      ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
      return;
    }
    ctx.commit({ state: { ...s, round, rankings: {}, lastResult: null }, phase: "RANK" });
  };

  if (!state.prompts) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Podium wird aufgebaut… 🏆</Panel>;
  }

  const prompt = state.prompts[state.round];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  if (phase === "RANK") {
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <PhaseHeader icon="📊" title={`Runde ${state.round + 1}/${state.prompts.length}`} subtitle="Wer am nächsten am Gruppen-Durchschnitt liegt, gewinnt die Runde." />
        <Panel glow className="mb-4 py-6 text-center">
          <p className="text-xl font-bold">{prompt.text}</p>
        </Panel>
        <div className="flex flex-col gap-2">
          {order.map((uid, i) => {
            const p = players.find((pl) => pl.id === uid);
            if (!p) return null;
            return (
              <motion.div
                key={uid}
                layout
                className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3"
              >
                <span className="display w-7 text-center text-lg font-extrabold" style={{ color: "var(--accent)" }}>{i + 1}</span>
                <Avatar name={p.username} hue={p.hue} size={36} />
                <span className="flex-1 truncate font-semibold">{p.username}</span>
                {!submitted && (
                  <span className="flex gap-1">
                    <button onClick={() => move(i, -1)} className="h-11 w-11 cursor-pointer rounded-xl border border-[var(--line)] hover:bg-[var(--bg-3)]">↑</button>
                    <button onClick={() => move(i, 1)} className="h-11 w-11 cursor-pointer rounded-xl border border-[var(--line)] hover:bg-[var(--bg-3)]">↓</button>
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
        <Button className="mt-4 w-full" size="lg" disabled={submitted} onClick={() => ctx.send("submit", order)}>
          {submitted ? "Abgegeben ✓" : "Ranking abschicken"}
        </Button>
        <div className="mt-3">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.rankings ?? {})} />
        </div>
      </div>
    );
  }

  if (phase === "REVEAL" && state.lastResult) {
    const { average, distances } = state.lastResult;
    const minDist = Math.min(...Object.values(distances));
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <PhaseHeader icon="🥁" title="Das Gruppen-Ranking" subtitle={prompt.text} />
        <Panel className="mb-4">
          {average.map((uid, i) => {
            const p = players.find((pl) => pl.id === uid);
            return (
              <motion.div
                key={uid}
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-3 border-b border-[var(--line)] py-2 last:border-0"
              >
                <span className="display w-7 text-lg font-extrabold">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                <Avatar name={p?.username ?? "?"} hue={p?.hue ?? 0} size={32} />
                <span className="font-semibold">{p?.username}</span>
              </motion.div>
            );
          })}
        </Panel>
        <Panel className="mb-4">
          <p className="mb-2 text-sm font-bold text-[var(--fg-muted)]">Wer lag am nächsten dran?</p>
          {players
            .filter((p) => distances[p.id] !== undefined)
            .sort((a, b) => distances[a.id] - distances[b.id])
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1 text-sm">
                <span>{p.username}</span>
                <span className={distances[p.id] === minDist ? "font-bold text-mint" : "text-[var(--fg-muted)]"}>
                  Abweichung {distances[p.id]} {distances[p.id] === minDist && "· +100 ✓"}
                </span>
              </div>
            ))}
        </Panel>
        <ScoreStrip ctx={ctx} scores={state.scores} />
        {isHost && (
          <Button className="mt-4 w-full" onClick={nextRound}>
            {state.round + 1 >= state.prompts.length ? "🏁 Endergebnis" : "Nächste Runde →"}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

export const rankingModule: GameModule = {
  id: "ranking",
  name: "Ranking Battle",
  description: "Alle ranken die Gruppe – wer dem Durchschnitt am nächsten kommt, punktet.",
  minPlayers: 3,
  maxPlayers: 12,
  themeColor: "#f4b63f",
  icon: "🏆",
  phases: ["RANK", "REVEAL", "RESULTS"],
  component: RankingBattle,
  threeScene: { id: "floaters", payload: { items: ["🥇", "🥈", "🥉", "📊"], colors: ["#f4b63f", "#c8f135"], density: 20 } },
};
