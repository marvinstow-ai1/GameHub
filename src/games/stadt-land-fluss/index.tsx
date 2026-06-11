"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Input, Panel } from "@/components/ui";
import { PhaseHeader, ScoreStrip, SharedTimer, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const LETTERS = "ABCDEFGHIJKLMNOPRSTUVWZ";
const TOTAL_ROUNDS = 3;
const ROUND_SECONDS = 75;

interface SlfState {
  categories: string[];
  letter: string;
  round: number;
  /** answers[round][uid] = string[] */
  answers: Record<string, Record<string, string[]>>;
  submitted: string[];
  scores: Record<string, number>;
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

function scoreRound(answers: Record<string, string[]>, letter: string, categories: string[]) {
  const scores: Record<string, number> = {};
  const detail: Record<string, number[]> = {};
  for (const uid of Object.keys(answers)) {
    scores[uid] = 0;
    detail[uid] = [];
  }
  categories.forEach((_, ci) => {
    const normalized: Record<string, string> = {};
    for (const uid of Object.keys(answers)) {
      const raw = (answers[uid]?.[ci] ?? "").trim().toLowerCase();
      normalized[uid] = raw.startsWith(letter.toLowerCase()) && raw.length > 1 ? raw : "";
    }
    for (const uid of Object.keys(answers)) {
      const value = normalized[uid];
      let pts = 0;
      if (value) {
        const dup = Object.entries(normalized).some(([other, v]) => other !== uid && v === value);
        pts = dup ? 5 : 10;
      }
      scores[uid] += pts;
      detail[uid].push(pts);
    }
  });
  return { scores, detail };
}

function StadtLandFluss({ ctx }: GameProps) {
  const state = ctx.state as SlfState;
  const { phase, self, isHost, players } = ctx;
  const [inputs, setInputs] = useState<string[]>(() => Array(5).fill(""));
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const initRef = useRef(false);

  // Host: Runde initialisieren
  useEffect(() => {
    if (!isHost || phase !== "WRITE" || initRef.current) return;
    if (state.letter && !state.roundDone) return;
    initRef.current = true;
    (async () => {
      const cats = await ctx.fetchContent<{ name: string }>("slf_categories", 5);
      const round = (state.round ?? 0) + 1;
      ctx.commit({
        state: {
          ...state,
          categories: cats.map((c) => c.name),
          letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
          round,
          submitted: [],
          roundDone: false,
          timerEnd: Date.now() + ROUND_SECONDS * 1000,
          timerTotal: ROUND_SECONDS * 1000,
        },
      });
    })();
  }, [isHost, phase, state, ctx]);

  // Neue Runde → Inputs leeren
  const [prevRound, setPrevRound] = useState(state.round ?? 0);
  if (prevRound !== (state.round ?? 0)) {
    setPrevRound(state.round ?? 0);
    setInputs(Array(state.categories?.length ?? 5).fill(""));
    setLocalSubmitted(false);
  }

  const iSubmitted = localSubmitted || (state.submitted ?? []).includes(self.id);
  const inputsRef = useRef(inputs);
  const submittedRef = useRef(iSubmitted);
  useEffect(() => {
    inputsRef.current = inputs;
    submittedRef.current = iSubmitted;
  }, [inputs, iSubmitted]);

  useHostActions(ctx, (action) => {
    const s = ctx.state as SlfState;
    if (action.type === "submit" && phase === "WRITE") {
      const roundKey = String(s.round);
      const answers = { ...s.answers, [roundKey]: { ...(s.answers?.[roundKey] ?? {}), [action.from]: action.data as string[] } };
      const submitted = [...new Set([...(s.submitted ?? []), action.from])];
      const everyone = players.every((p) => submitted.includes(p.id) || !p.online);
      if (everyone) {
        const { scores } = scoreRound(answers[roundKey], s.letter, s.categories);
        const total = { ...s.scores };
        for (const [uid, pts] of Object.entries(scores)) total[uid] = (total[uid] ?? 0) + pts;
        ctx.commit({ state: { ...s, answers, submitted, scores: total, roundDone: true }, phase: "REVIEW" });
      } else {
        ctx.commit({ state: { ...s, answers, submitted } });
      }
    }
    if (action.type === "stop" && phase === "WRITE") {
      // Klassisch: "Stopp!" beendet die Runde für alle – fehlende Antworten zählen nicht
      ctx.sendEvent("force-submit");
    }
  });

  // Bei "Stopp" oder Timer-Ende: eigene (Teil-)Antworten abschicken
  useEffect(() => {
    return ctx.onEvent((event) => {
      if (event.type === "force-submit" && !submittedRef.current && phase === "WRITE") {
        submittedRef.current = true;
        ctx.send("submit", inputsRef.current);
      }
    });
  }, [ctx, phase]);

  const submitMine = () => {
    if (iSubmitted) return;
    setLocalSubmitted(true);
    ctx.send("submit", inputs);
    ctx.send("stop");
  };

  if (!state.letter || !state.categories) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Kategorien werden gezogen… ✍️</Panel>;
  }

  if (phase === "WRITE") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <PhaseHeader
          icon="✍️"
          title={`Buchstabe: ${state.letter}`}
          subtitle={`Runde ${state.round} von ${TOTAL_ROUNDS} – wer zuerst fertig ist, drückt Stopp!`}
        />
        <div className="mb-4 flex justify-center">
          <SharedTimer
            ctx={ctx}
            color="#4dc9ff"
            size={90}
            onDone={() => ctx.sendEvent("force-submit")}
          />
        </div>
        <div className="flex flex-col gap-3">
          {state.categories.map((cat, i) => (
            <motion.div key={cat} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <label className="mb-1 block text-sm font-bold">{cat}</label>
              <Input
                value={inputs[i] ?? ""}
                disabled={iSubmitted}
                placeholder={`${cat} mit ${state.letter}…`}
                onChange={(e) => {
                  const next = [...inputs];
                  next[i] = e.target.value;
                  setInputs(next);
                }}
              />
            </motion.div>
          ))}
        </div>
        <Button className="mt-5 w-full" size="lg" disabled={iSubmitted} onClick={submitMine}>
          {iSubmitted ? "Abgegeben ✓" : "🛑 Stopp!"}
        </Button>
        <div className="mt-3">
          <WaitingFor ctx={ctx} doneIds={state.submitted ?? []} />
        </div>
      </div>
    );
  }

  if (phase === "REVIEW") {
    const roundAnswers = state.answers?.[String(state.round)] ?? {};
    const { detail } = scoreRound(roundAnswers, state.letter, state.categories);
    const isLast = state.round >= TOTAL_ROUNDS;
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <PhaseHeader icon="📊" title={`Auswertung – Runde ${state.round}`} subtitle="10 Punkte einzigartig · 5 doppelt · 0 ungültig" />
        <ScoreStrip ctx={ctx} scores={state.scores} />
        <div className="scrollbar-slim mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-[var(--fg-muted)]">
                <th className="py-2 pr-2">Spieler</th>
                {state.categories.map((c) => (
                  <th key={c} className="py-2 pr-2">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-2 font-bold">{p.username}</td>
                  {state.categories.map((_, ci) => {
                    const answer = roundAnswers[p.id]?.[ci] ?? "";
                    const pts = detail[p.id]?.[ci] ?? 0;
                    return (
                      <td key={ci} className="py-2 pr-2">
                        <span className={pts === 0 ? "text-[var(--fg-muted)] line-through" : pts === 10 ? "font-bold text-mint" : ""}>
                          {answer || "—"}
                        </span>
                        {answer && <span className="ml-1 text-xs text-[var(--fg-muted)]">+{pts}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isHost && (
          <Button
            className="mt-6 w-full"
            onClick={() => {
              if (isLast) {
                const best = Math.max(...players.map((p) => state.scores[p.id] ?? 0));
                ctx.endGame(players.filter((p) => (state.scores[p.id] ?? 0) === best).map((p) => p.id), state.scores);
              } else {
                initRef.current = false;
                ctx.commit({ state: { ...state, roundDone: true }, phase: "WRITE" });
              }
            }}
          >
            {isLast ? "🏁 Endergebnis" : "Nächste Runde →"}
          </Button>
        )}
        {!isHost && <Chip className="mx-auto mt-6 flex w-fit">Warte auf den Host…</Chip>}
      </div>
    );
  }

  return null;
}

export const stadtLandFlussModule: GameModule = {
  id: "stadt-land-fluss",
  name: "Stadt Land Fluss",
  description: "Ein Buchstabe, fünf Kategorien, null Gnade. Wer zuerst fertig ist, stoppt alle.",
  minPlayers: 2,
  maxPlayers: 12,
  themeColor: "#4dc9ff",
  icon: "🌍",
  phases: ["WRITE", "REVIEW", "RESULTS"],
  component: StadtLandFluss,
  threeScene: {
    id: "floaters",
    payload: { items: "ABCDEFGHKLMNORSTUW".split(""), colors: ["#4dc9ff", "#8b7cff", "#3ee6a8"], density: 30 },
  },
};
