"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Input, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, ScoreStrip, SharedTimer, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const TOTAL_ROUNDS = 5;
const WRITE_SECONDS = 60;

interface HotState {
  prompts: { text: string }[];
  round: number;
  submissions: Record<string, string>;
  votes: Record<string, string>;
  scores: Record<string, number>;
  /** stabile, anonyme Reihenfolge für die Voting-Anzeige */
  shuffle: string[];
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

function HotTakes({ ctx }: GameProps) {
  const state = ctx.state as HotState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!isHost || phase !== "WRITE" || state.prompts || initRef.current) return;
    initRef.current = true;
    (async () => {
      const prompts = await ctx.fetchContent<{ text: string }>("hottake_prompts", TOTAL_ROUNDS);
      ctx.commit({
        state: {
          prompts,
          round: 0,
          submissions: {},
          votes: {},
          scores: {},
          shuffle: [],
          timerEnd: Date.now() + WRITE_SECONDS * 1000,
          timerTotal: WRITE_SECONDS * 1000,
        },
      });
    })();
  }, [isHost, phase, state.prompts, ctx]);

  const [prevRound, setPrevRound] = useState(state.round);
  if (prevRound !== state.round) {
    setPrevRound(state.round);
    setText("");
  }

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as HotState;
    if (!s.prompts) return;

    const toVoting = (submissions: Record<string, string>) => {
      if (Object.keys(submissions).length < 2) {
        // zu wenige Antworten → Runde überspringen statt hängen zu bleiben
        const round = s.round + 1;
        if (round >= s.prompts.length) {
          const best = Math.max(0, ...players.map((p) => s.scores[p.id] ?? 0));
          ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
          return;
        }
        ctx.commit({
          state: { ...s, round, submissions: {}, votes: {}, shuffle: [], timerEnd: Date.now() + WRITE_SECONDS * 1000, timerTotal: WRITE_SECONDS * 1000 },
          phase: "WRITE",
        });
        return;
      }
      ctx.commit({
        state: {
          ...s,
          submissions,
          shuffle: Object.keys(submissions).sort(() => Math.random() - 0.5),
          votes: {},
          timerEnd: undefined,
          timerTotal: undefined,
        },
        phase: "VOTE",
      });
    };

    const tallyVotes = (votes: Record<string, string>) => {
      const scores = { ...s.scores };
      for (const target of Object.values(votes)) scores[target] = (scores[target] ?? 0) + 100;
      ctx.commit({ state: { ...s, votes, scores }, phase: "REVEAL" });
    };

    if (action.type === "timeout" && snap.phase === "WRITE") {
      toVoting(s.submissions);
    }
    if (action.type === "force-vote" && snap.phase === "VOTE") {
      tallyVotes(s.votes);
    }
    if (action.type === "next" && snap.phase === "REVEAL") {
      const round = s.round + 1;
      if (round >= s.prompts.length) {
        const best = Math.max(...players.map((p) => s.scores[p.id] ?? 0));
        ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
        return;
      }
      ctx.commit({
        state: { ...s, round, submissions: {}, votes: {}, shuffle: [], timerEnd: Date.now() + WRITE_SECONDS * 1000, timerTotal: WRITE_SECONDS * 1000 },
        phase: "WRITE",
      });
    }
    if (action.type === "submit" && snap.phase === "WRITE") {
      const submissions = { ...s.submissions, [action.from]: action.data as string };
      const everyone = players.every((p) => submissions[p.id] || !p.online);
      if (everyone) toVoting(submissions);
      else ctx.commit({ state: { ...s, submissions } });
    }
    if (action.type === "vote" && snap.phase === "VOTE") {
      if (action.data === action.from) return; // nicht für sich selbst
      const votes = { ...s.votes, [action.from]: action.data as string };
      const everyone = players.every((p) => votes[p.id] || !p.online);
      if (everyone) tallyVotes(votes);
      else ctx.commit({ state: { ...s, votes } });
    }
  });

  if (!state.prompts) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Heiße Themen werden angeheizt… 🌶️</Panel>;
  }

  const prompt = state.prompts[state.round];
  const submitted = !!state.submissions?.[self.id];

  if (phase === "WRITE") {
    return (
      <div className="mx-auto max-w-md px-4 pt-6 text-center">
        <PhaseHeader icon="🌶️" title={`Runde ${state.round + 1}/${state.prompts.length}`} subtitle="Schreib die beste Antwort – gevotet wird anonym!" />
        <div className="mb-4 flex justify-center">
          <SharedTimer ctx={ctx} color="#d96bff" size={84} onDone={() => ctx.send("timeout")} />
        </div>
        <Panel glow className="mb-4 py-8">
          <p className="text-xl font-bold leading-snug">{prompt.text}</p>
        </Panel>
        <div className="flex gap-2">
          <Input
            placeholder="Deine Antwort…"
            value={text}
            disabled={submitted}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && text.trim() && ctx.send("submit", text.trim())}
          />
          <Button disabled={submitted || !text.trim()} onClick={() => ctx.send("submit", text.trim())}>
            {submitted ? "✓" : "Senden"}
          </Button>
        </div>
        <div className="mt-3">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.submissions ?? {})} />
        </div>
      </div>
    );
  }

  if (phase === "VOTE") {
    const myVote = state.votes?.[self.id];
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <PhaseHeader icon="🗳️" title="Anonymes Voting" subtitle={prompt.text} />
        <div className="flex flex-col gap-3">
          {state.shuffle.map((uid, i) => {
            const mine = uid === self.id;
            return (
              <motion.button
                key={uid}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.07 }}
                disabled={mine || !!myVote}
                onClick={() => ctx.send("vote", uid)}
                className={cn(
                  "rounded-2xl border p-4 text-left font-semibold transition-all cursor-pointer",
                  myVote === uid ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]",
                  mine && "opacity-50"
                )}
              >
                „{state.submissions[uid]}“ {mine && <span className="text-xs text-[var(--fg-muted)]">(deine)</span>}
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.votes ?? {})} label="Es voten noch" />
        </div>
        <HostEscape ctx={ctx} label="Voting jetzt auswerten" action="force-vote" />
      </div>
    );
  }

  if (phase === "REVEAL") {
    const counts: Record<string, number> = {};
    for (const t of Object.values(state.votes ?? {})) counts[t] = (counts[t] ?? 0) + 1;
    const ranked = state.shuffle.slice().sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <PhaseHeader icon="🏅" title="Auflösung" subtitle={prompt.text} />
        <div className="flex flex-col gap-3">
          {ranked.map((uid, i) => (
            <motion.div key={uid} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.12 }}>
              <Panel className={i === 0 && (counts[uid] ?? 0) > 0 ? "border-[var(--accent)]" : ""}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">„{state.submissions[uid]}“</p>
                  <span className="display whitespace-nowrap font-bold">{counts[uid] ?? 0} ❤️</span>
                </div>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  von {players.find((p) => p.id === uid)?.username} · +{(counts[uid] ?? 0) * 100} Punkte
                </p>
              </Panel>
            </motion.div>
          ))}
        </div>
        <div className="mt-4">
          <ScoreStrip ctx={ctx} scores={state.scores} />
        </div>
        {isHost && (
          <Button className="mt-4 w-full" onClick={() => ctx.send("next")}>
            {state.round + 1 >= state.prompts.length ? "🏁 Endergebnis" : "Nächste Runde →"}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

export const hotTakesModule: GameModule = {
  id: "hot-takes",
  name: "Hot Take Voting",
  description: "Quiplash-Style: Antworten einreichen, anonym voten, Punkte kassieren.",
  minPlayers: 3,
  maxPlayers: 16,
  themeColor: "#d96bff",
  icon: "🌶️",
  phases: ["WRITE", "VOTE", "REVEAL", "RESULTS"],
  component: HotTakes,
  threeScene: { id: "floaters", payload: { items: ["🌶️", "🔥", "💯"], colors: ["#d96bff", "#ff5c4d"], density: 20 } },
};
