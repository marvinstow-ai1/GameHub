"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, ScoreStrip, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const TOTAL_ROUNDS = 15;

interface NhieState {
  prompts: { text: string }[];
  index: number;
  /** answers[uid] = true → "Ich schon" */
  answers: Record<string, boolean>;
  scores: Record<string, number>;
  [key: string]: unknown;
}

function NeverHaveIEver({ ctx }: GameProps) {
  const state = ctx.state as NhieState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);

  useEffect(() => {
    if (!isHost || phase !== "ANSWER" || state.prompts || initRef.current) return;
    initRef.current = true;
    (async () => {
      const prompts = await ctx.fetchContent<{ text: string }>("nhie_prompts", TOTAL_ROUNDS);
      ctx.commit({ state: { prompts, index: 0, answers: {}, scores: {} } });
    })();
  }, [isHost, phase, state.prompts, ctx]);

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as NhieState;
    if (!s.prompts) return;

    const reveal = (answers: NhieState["answers"]) => {
      const scores = { ...s.scores };
      for (const [uid, did] of Object.entries(answers)) if (did) scores[uid] = (scores[uid] ?? 0) + 1;
      ctx.commit({ state: { ...s, answers, scores }, phase: "REVEAL" });
    };

    if (action.type === "answer" && snap.phase === "ANSWER") {
      if (s.answers[action.from] !== undefined) return;
      const answers = { ...s.answers, [action.from]: action.data as boolean };
      const everyone = players.every((p) => answers[p.id] !== undefined || !p.online);
      if (everyone) reveal(answers);
      else ctx.commit({ state: { ...s, answers } });
    }
    if (action.type === "force-reveal" && snap.phase === "ANSWER") {
      reveal(s.answers);
    }
    if (action.type === "next" && snap.phase === "REVEAL") {
      const index = s.index + 1;
      if (index >= s.prompts.length) {
        const best = Math.max(...players.map((p) => s.scores[p.id] ?? 0));
        ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
        return;
      }
      ctx.commit({ state: { ...s, index, answers: {} }, phase: "ANSWER" });
    }
  });

  if (!state.prompts) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Geständnisse werden vorbereitet… 🙊</Panel>;
  }

  const prompt = state.prompts[state.index];
  const answered = state.answers?.[self.id] !== undefined;

  if (phase === "ANSWER") {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 text-center">
        <PhaseHeader icon="🙊" title={`${state.index + 1} / ${state.prompts.length}`} subtitle="Sei ehrlich…" />
        <motion.div key={state.index} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <Panel glow className="py-10">
            <p className="text-2xl font-bold leading-snug">Ich hab noch nie… {prompt.text}</p>
          </Panel>
        </motion.div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="ghost" size="lg" disabled={answered} onClick={() => ctx.send("answer", false)}>
            😇 Ich auch nie
          </Button>
          <Button size="lg" disabled={answered} onClick={() => ctx.send("answer", true)}>
            🙋 Ich schon…
          </Button>
        </div>
        <div className="mt-4">
          <WaitingFor ctx={ctx} doneIds={Object.keys(state.answers ?? {})} />
        </div>
        <HostEscape ctx={ctx} label="Jetzt auflösen" action="force-reveal" />
      </div>
    );
  }

  if (phase === "REVEAL") {
    const guilty = players.filter((p) => state.answers?.[p.id]);
    const innocent = players.filter((p) => state.answers?.[p.id] === false);
    return (
      <div className="mx-auto max-w-md px-4 pt-8 text-center">
        <PhaseHeader icon="👀" title="Aufgedeckt!" subtitle={`Ich hab noch nie… ${prompt.text}`} />
        <div className="grid grid-cols-2 gap-3">
          <Panel>
            <p className="mb-3 font-bold text-coral">🙋 Schon passiert ({guilty.length})</p>
            <div className="flex flex-wrap justify-center gap-2">
              {guilty.map((p) => (
                <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                  <Avatar name={p.username} hue={p.hue} size={40} />
                  <span className="mt-1 max-w-16 truncate text-xs">{p.username}</span>
                </motion.div>
              ))}
            </div>
          </Panel>
          <Panel>
            <p className="mb-3 font-bold text-mint">😇 Unschuldig ({innocent.length})</p>
            <div className="flex flex-wrap justify-center gap-2">
              {innocent.map((p) => (
                <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                  <Avatar name={p.username} hue={p.hue} size={40} />
                  <span className="mt-1 max-w-16 truncate text-xs">{p.username}</span>
                </motion.div>
              ))}
            </div>
          </Panel>
        </div>
        <div className={cn("mt-5")}>
          <ScoreStrip ctx={ctx} scores={state.scores} />
        </div>
        {isHost && (
          <Button className="mt-4 w-full" onClick={() => ctx.send("next")}>
            {state.index + 1 >= state.prompts.length ? "🏁 Endergebnis" : "Nächste Aussage →"}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

export const neverHaveIEverModule: GameModule = {
  id: "never-have-i-ever",
  name: "Never Have I Ever",
  description: "Ich hab noch nie… – wer's doch getan hat, sammelt Punkte und Blicke.",
  minPlayers: 3,
  maxPlayers: 20,
  themeColor: "#ff5c4d",
  icon: "🙊",
  phases: ["ANSWER", "REVEAL", "RESULTS"],
  component: NeverHaveIEver,
  threeScene: { id: "floaters", payload: { items: ["🙊", "😇", "🍹"], colors: ["#ff5c4d", "#ffc24d"], density: 20 } },
};
