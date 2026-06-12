"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Panel, cn } from "@/components/ui";
import { PhaseHeader, ScoreStrip, SharedTimer, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const TOTAL_QUESTIONS = 10;
const QUESTION_SECONDS = 15;

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  category: string;
}

interface QuizState {
  questions: QuizQuestion[];
  index: number;
  /** answers[uid] = { choice, ms } für die aktuelle Frage */
  answers: Record<string, { choice: number; ms: number }>;
  scores: Record<string, number>;
  questionStart: number;
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

function QuizBattle({ ctx }: GameProps) {
  const state = ctx.state as QuizState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!isHost || phase !== "QUESTION" || state.questions || initRef.current) return;
    initRef.current = true;
    (async () => {
      const questions = await ctx.fetchContent<QuizQuestion>("quiz_questions", TOTAL_QUESTIONS);
      ctx.commit({
        state: {
          questions,
          index: 0,
          answers: {},
          scores: {},
          questionStart: Date.now(),
          timerEnd: Date.now() + QUESTION_SECONDS * 1000,
          timerTotal: QUESTION_SECONDS * 1000,
        },
      });
    })();
  }, [isHost, phase, state.questions, ctx]);

  const [prevIndex, setPrevIndex] = useState(state.index);
  if (prevIndex !== state.index) {
    setPrevIndex(state.index);
    setPicked(null);
  }

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as QuizState;
    if (!s.questions) return;

    const finishQuestion = (answers: QuizState["answers"]) => {
      const q = s.questions[s.index];
      const scores = { ...s.scores };
      for (const [uid, a] of Object.entries(answers)) {
        if (a.choice === q.correct) {
          const speedBonus = Math.max(0, Math.round(100 * (1 - a.ms / (QUESTION_SECONDS * 1000))));
          scores[uid] = (scores[uid] ?? 0) + 100 + speedBonus;
        }
      }
      ctx.commit({ state: { ...s, answers, scores, timerEnd: undefined, timerTotal: undefined }, phase: "REVEAL" });
    };

    if (action.type === "answer" && snap.phase === "QUESTION") {
      if (s.answers[action.from]) return;
      const answers = { ...s.answers, [action.from]: action.data as { choice: number; ms: number } };
      const everyone = players.every((p) => answers[p.id] || !p.online);
      if (everyone) finishQuestion(answers);
      else ctx.commit({ state: { ...s, answers } });
    }
    if (action.type === "timeout" && snap.phase === "QUESTION") {
      finishQuestion(s.answers);
    }
    if (action.type === "next" && snap.phase === "REVEAL") {
      const index = s.index + 1;
      if (index >= s.questions.length) {
        const best = Math.max(...players.map((p) => s.scores[p.id] ?? 0));
        ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
        return;
      }
      ctx.commit({
        state: {
          ...s,
          index,
          answers: {},
          questionStart: Date.now(),
          timerEnd: Date.now() + QUESTION_SECONDS * 1000,
          timerTotal: QUESTION_SECONDS * 1000,
        },
        phase: "QUESTION",
      });
    }
  });

  if (!state.questions) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Fragen werden geladen… 🧠</Panel>;
  }

  const q = state.questions[state.index];
  const answered = !!state.answers?.[self.id] || picked !== null;

  if (phase === "QUESTION") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <PhaseHeader icon="🧠" title={`Frage ${state.index + 1}/${state.questions.length}`} subtitle={q.category} />
        <div className="mb-4 flex justify-center">
          <SharedTimer ctx={ctx} color="#c8f135" size={90} onDone={() => ctx.send("timeout")} />
        </div>
        <Panel glow className="mb-5 text-center">
          <p className="text-xl font-bold">{q.question}</p>
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((opt, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.96 }}
              disabled={answered}
              onClick={() => {
                setPicked(i);
                ctx.send("answer", { choice: i, ms: Date.now() - state.questionStart });
              }}
              className={cn(
                "rounded-2xl border p-4 text-left font-semibold transition-all cursor-pointer",
                picked === i
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]",
                answered && picked !== i && "opacity-50"
              )}
            >
              <span className="display mr-2 text-[var(--fg-muted)]">{["A", "B", "C", "D"][i]}</span>
              {opt}
            </motion.button>
          ))}
        </div>
        <div className="mt-4">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.answers ?? {})} />
        </div>
      </div>
    );
  }

  if (phase === "REVEAL") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <PhaseHeader icon="✅" title="Auflösung" />
        <Panel className="mb-5 text-center">
          <p className="text-lg font-bold">{q.question}</p>
          <p className="mt-3 text-xl font-extrabold text-mint">{q.options[q.correct]}</p>
        </Panel>
        <div className="grid gap-2">
          {players.map((p) => {
            const a = state.answers?.[p.id];
            const correct = a?.choice === q.correct;
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-2">
                <span className="font-semibold">{p.username}</span>
                <span className="flex items-center gap-2 text-sm">
                  {a ? (
                    <>
                      <span className={correct ? "text-mint" : "text-coral"}>{correct ? "✓" : "✗"} {q.options[a.choice]}</span>
                      <Chip>{(a.ms / 1000).toFixed(1)}s</Chip>
                    </>
                  ) : (
                    <span className="text-[var(--fg-muted)]">keine Antwort</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <ScoreStrip ctx={ctx} scores={state.scores} />
        </div>
        {isHost && (
          <Button className="mt-4 w-full" onClick={() => ctx.send("next")}>
            {state.index + 1 >= state.questions.length ? "🏁 Endergebnis" : "Nächste Frage →"}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

export const quizBattleModule: GameModule = {
  id: "quiz-battle",
  name: "Quiz-Battle",
  description: "Multiple Choice gegen die Uhr – wer schneller richtig liegt, kassiert Bonuspunkte.",
  minPlayers: 2,
  maxPlayers: 16,
  themeColor: "#c8f135",
  icon: "🧠",
  phases: ["QUESTION", "REVEAL", "RESULTS"],
  component: QuizBattle,
  threeScene: { id: "floaters", payload: { items: ["?", "!", "A", "B", "C", "D"], colors: ["#c8f135", "#4dc9ff"], density: 26 } },
};
