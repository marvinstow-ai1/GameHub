"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Chip, Panel } from "@/components/ui";
import { HostEscape, PhaseHeader, ScoreStrip, SharedTimer, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const DARE_SECONDS = 90;

interface TdPrompt {
  kind: "truth" | "dare";
  text: string;
  spice: number;
}

interface TdState {
  order: string[];
  turn: number;
  current?: { kind: "truth" | "dare"; text: string } | null;
  pool: { truth: TdPrompt[]; dare: TdPrompt[] };
  scores: Record<string, number>;
  timerEnd?: number;
  timerTotal?: number;
  [key: string]: unknown;
}

function WahrheitPflicht({ ctx }: GameProps) {
  const state = ctx.state as TdState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);

  useEffect(() => {
    if (!isHost || phase !== "CHOOSE" || state.order || initRef.current) return;
    initRef.current = true;
    (async () => {
      const prompts = await ctx.fetchContent<TdPrompt>("td_prompts", 120);
      ctx.commit({
        state: {
          order: [...players.map((p) => p.id)].sort(() => Math.random() - 0.5),
          turn: 0,
          pool: {
            truth: prompts.filter((p) => p.kind === "truth"),
            dare: prompts.filter((p) => p.kind === "dare"),
          },
          scores: {},
          current: null,
        },
      });
    })();
  }, [isHost, phase, state.order, players, ctx]);

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as TdState;
    if (!s.order) return;
    const activeId = s.order[s.turn % s.order.length];

    // Aktiver Spieler reagiert nicht mehr → Host kann überspringen
    if (action.type === "force-skip-player") {
      ctx.commit({ state: { ...s, turn: s.turn + 1, current: null, timerEnd: undefined, timerTotal: undefined }, phase: "CHOOSE" });
      return;
    }
    if (action.from !== activeId) return;

    if (action.type === "choose" && snap.phase === "CHOOSE") {
      const kind = action.data as "truth" | "dare";
      const pool = { ...s.pool, [kind]: [...s.pool[kind]] };
      const prompt = pool[kind].shift();
      if (!prompt) return;
      const isDare = kind === "dare";
      ctx.commit({
        state: {
          ...s,
          pool,
          current: { kind, text: prompt.text },
          ...(isDare ? { timerEnd: Date.now() + DARE_SECONDS * 1000, timerTotal: DARE_SECONDS * 1000 } : { timerEnd: undefined, timerTotal: undefined }),
        },
        phase: "DOING",
      });
    }
    if ((action.type === "done" || action.type === "skip") && snap.phase === "DOING") {
      const scores = { ...s.scores };
      if (action.type === "done") scores[activeId] = (scores[activeId] ?? 0) + 1;
      ctx.commit({
        state: { ...s, scores, turn: s.turn + 1, current: null, timerEnd: undefined, timerTotal: undefined },
        phase: "CHOOSE",
      });
    }
  });

  if (!state.order) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Der Flaschenhals dreht sich… 🍾</Panel>;
  }

  const activeId = state.order[state.turn % state.order.length];
  const active = players.find((p) => p.id === activeId);
  const myTurn = activeId === self.id;

  if (phase === "CHOOSE") {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 text-center">
        <PhaseHeader icon="🍾" title={myTurn ? "Du bist dran!" : `${active?.username} ist dran`} subtitle={`Runde ${Math.floor(state.turn / state.order.length) + 1}`} />
        {active && (
          <motion.div key={activeId} initial={{ scale: 0 }} animate={{ scale: 1 }} className="mb-6 flex justify-center">
            <Avatar name={active.username} hue={active.hue} size={88} />
          </motion.div>
        )}
        {myTurn ? (
          <div className="grid grid-cols-2 gap-4">
            <motion.button
              whileHover={{ scale: 1.04, rotate: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => ctx.send("choose", "truth")}
              className="cursor-pointer rounded-3xl bg-sky p-8 text-[#0e0e10]"
            >
              <span className="text-4xl">💬</span>
              <p className="display mt-2 text-xl font-extrabold">Wahrheit</p>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, rotate: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => ctx.send("choose", "dare")}
              className="cursor-pointer rounded-3xl bg-coral p-8 text-white"
            >
              <span className="text-4xl">🔥</span>
              <p className="display mt-2 text-xl font-extrabold">Pflicht</p>
            </motion.button>
          </div>
        ) : (
          <>
            <p className="animate-pulse-soft text-lg text-[var(--fg-muted)]">Wahrheit… oder Pflicht? 👀</p>
            <HostEscape ctx={ctx} label="Spieler überspringen (reagiert nicht)" action="force-skip-player" />
          </>
        )}
        <div className="mt-8">
          <ScoreStrip ctx={ctx} scores={state.scores} />
        </div>
        {isHost && state.turn >= state.order.length && (
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              const best = Math.max(0, ...players.map((p) => state.scores[p.id] ?? 0));
              ctx.endGame(players.filter((p) => (state.scores[p.id] ?? 0) === best && best > 0).map((p) => p.id), state.scores);
            }}
          >
            Spiel beenden
          </Button>
        )}
      </div>
    );
  }

  if (phase === "DOING" && state.current) {
    const isDare = state.current.kind === "dare";
    return (
      <div className="mx-auto max-w-md px-4 pt-8 text-center">
        <PhaseHeader
          icon={isDare ? "🔥" : "💬"}
          title={isDare ? "Pflicht!" : "Wahrheit!"}
          subtitle={myTurn ? "Zieh es durch." : `${active?.username} muss liefern`}
        />
        <motion.div initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }}>
          <Panel glow className="py-10">
            <p className="text-2xl font-bold leading-snug">{state.current.text}</p>
          </Panel>
        </motion.div>
        {isDare && (
          <div className="mt-6 flex justify-center">
            <SharedTimer ctx={ctx} color="#ff6bb5" onDone={() => {}} />
          </div>
        )}
        {myTurn ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => ctx.send("skip")}>😶 Kneifen</Button>
            <Button onClick={() => ctx.send("done")}>✓ Erledigt (+1)</Button>
          </div>
        ) : (
          <>
            <Chip className="mx-auto mt-6 flex w-fit">Die Gruppe urteilt mit den Augen 👁️👁️</Chip>
            <HostEscape ctx={ctx} label="Spieler überspringen (reagiert nicht)" action="force-skip-player" />
          </>
        )}
      </div>
    );
  }

  return null;
}

export const wahrheitPflichtModule: GameModule = {
  id: "wahrheit-pflicht",
  name: "Wahrheit oder Pflicht",
  description: "Der Klassiker – mit großem Fragen-Pool und Pflicht-Timer.",
  minPlayers: 2,
  maxPlayers: 16,
  themeColor: "#ff6bb5",
  icon: "🍾",
  phases: ["CHOOSE", "DOING", "RESULTS"],
  component: WahrheitPflicht,
  threeScene: { id: "floaters", payload: { items: ["💬", "🔥", "🍾"], colors: ["#ff6bb5", "#ff5c4d"], density: 20 } },
};
