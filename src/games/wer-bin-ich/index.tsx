"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Chip, Input, Panel } from "@/components/ui";
import { HostEscape, PhaseHeader, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

interface WhoState {
  /** assigned[uid] = Charaktername (für uid selbst unsichtbar) */
  assigned: Record<string, string>;
  order: string[];
  turn: number;
  votes: Record<string, boolean>;
  /** uid → Platzierung (1 = zuerst erraten) */
  solved: Record<string, number>;
  lastGuess?: { uid: string; guess: string; correct: boolean } | null;
  [key: string]: unknown;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
}

function WerBinIch({ ctx }: GameProps) {
  const state = ctx.state as WhoState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [guess, setGuess] = useState("");

  useEffect(() => {
    if (!isHost || phase !== "TURN" || state.assigned || initRef.current) return;
    initRef.current = true;
    (async () => {
      const chars = await ctx.fetchContent<{ name: string }>("whoami_characters", players.length);
      const assigned: Record<string, string> = {};
      players.forEach((p, i) => (assigned[p.id] = chars[i % chars.length].name));
      ctx.commit({
        state: {
          assigned,
          order: [...players.map((p) => p.id)].sort(() => Math.random() - 0.5),
          turn: 0,
          votes: {},
          solved: {},
        },
      });
    })();
  }, [isHost, phase, state.assigned, players, ctx]);

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as WhoState;
    if (!s.order) return;
    const activeId = s.order[s.turn % s.order.length];

    if (action.type === "force-skip-turn" && snap.phase === "TURN") {
      ctx.commit({ state: { ...s, votes: {}, turn: nextTurn(s), lastGuess: null } });
      return;
    }
    if (action.type === "vote" && snap.phase === "TURN" && action.from !== activeId) {
      const votes = { ...s.votes, [action.from]: action.data as boolean };
      ctx.commit({ state: { ...s, votes } });
    }
    if (action.type === "next" && action.from === activeId && snap.phase === "TURN") {
      ctx.commit({ state: { ...s, votes: {}, turn: nextTurn(s), lastGuess: null } });
    }
    if (action.type === "guess" && action.from === activeId && snap.phase === "TURN") {
      const target = s.assigned[activeId];
      const correct = normalize(action.data as string) === normalize(target);
      const solved = { ...s.solved };
      if (correct) solved[activeId] = Object.keys(s.solved).length + 1;
      const everyoneSolved = s.order.every((id) => solved[id] !== undefined);
      if (everyoneSolved) {
        const scores: Record<string, number> = {};
        for (const [uid, place] of Object.entries(solved)) scores[uid] = Math.max(0, s.order.length - place + 1);
        ctx.commit({ state: { ...s, solved, lastGuess: { uid: activeId, guess: action.data as string, correct } } });
        ctx.endGame([Object.entries(solved).find(([, place]) => place === 1)![0]], scores);
      } else {
        ctx.commit({
          state: {
            ...s,
            solved,
            votes: {},
            lastGuess: { uid: activeId, guess: action.data as string, correct },
            turn: nextTurn({ ...s, solved }),
          },
        });
      }
    }
  });

  function nextTurn(s: WhoState) {
    let t = s.turn + 1;
    for (let i = 0; i < s.order.length; i++, t++) {
      if (s.solved[s.order[t % s.order.length]] === undefined) break;
    }
    return t;
  }

  if (!state.assigned) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Identitäten werden verteilt… 🎭</Panel>;
  }

  const activeId = state.order[state.turn % state.order.length];
  const active = players.find((p) => p.id === activeId);
  const myTurn = activeId === self.id;
  const iSolved = state.solved?.[self.id] !== undefined;
  const yes = Object.values(state.votes ?? {}).filter(Boolean).length;
  const no = Object.values(state.votes ?? {}).filter((v) => v === false).length;

  return (
    <div className="mx-auto max-w-xl px-4 pt-6">
      <PhaseHeader
        icon="🎭"
        title={myTurn ? "Du bist dran – frag!" : `${active?.username} rät gerade`}
        subtitle="Stelle Ja/Nein-Fragen laut in die Runde – alle stimmen ab."
      />

      {/* Wer-ist-wer-Übersicht: jeder sieht alle Identitäten außer die eigene */}
      <div className="scrollbar-slim mb-5 flex gap-3 overflow-x-auto py-1">
        {players.map((p) => (
          <div key={p.id} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
            <Avatar name={p.username} hue={p.hue} size={44} />
            <span className="w-full truncate text-[10px] text-[var(--fg-muted)]">{p.username}</span>
            <Chip className={state.solved?.[p.id] !== undefined ? "border-mint text-mint" : ""}>
              {p.id === self.id
                ? iSolved
                  ? state.assigned[p.id]
                  : "❓ DU"
                : state.assigned[p.id]}
            </Chip>
          </div>
        ))}
      </div>

      {state.lastGuess && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-4">
          <Panel className={state.lastGuess.correct ? "border-mint" : "border-coral"}>
            <p className="text-center text-sm">
              <strong>{players.find((p) => p.id === state.lastGuess!.uid)?.username}</strong> riet{" "}
              <strong>„{state.lastGuess.guess}“</strong> – {state.lastGuess.correct ? "richtig! 🎉" : "falsch 😅"}
            </p>
          </Panel>
        </motion.div>
      )}

      {myTurn && !iSolved ? (
        <Panel glow>
          <p className="mb-3 text-center text-sm text-[var(--fg-muted)]">
            Frag laut („Bin ich eine Frau?“) und schau auf die Stimmen:
          </p>
          <div className="mb-4 flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="display text-4xl font-extrabold text-mint">{yes}</p>
              <p className="text-xs text-[var(--fg-muted)]">JA</p>
            </div>
            <div className="text-center">
              <p className="display text-4xl font-extrabold text-coral">{no}</p>
              <p className="text-xs text-[var(--fg-muted)]">NEIN</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Ich bin… (Lösung eingeben)" value={guess} onChange={(e) => setGuess(e.target.value)} />
            <Button disabled={!guess.trim()} onClick={() => { ctx.send("guess", guess.trim()); setGuess(""); }}>
              Raten!
            </Button>
          </div>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => ctx.send("next")}>
            Nächster Spieler →
          </Button>
        </Panel>
      ) : (
        <Panel>
          <p className="mb-3 text-center font-bold">
            {active?.username} fragt – stimmt ab: trifft es zu?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => ctx.send("vote", false)} className={state.votes?.[self.id] === false ? "border-coral" : ""}>
              👎 Nein
            </Button>
            <Button variant="soft" onClick={() => ctx.send("vote", true)} className={state.votes?.[self.id] === true ? "ring-2 ring-mint" : ""}>
              👍 Ja
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-sm text-[var(--fg-muted)]">
            <span>👍 {yes}</span>
            <span>👎 {no}</span>
          </div>
          <div className="mt-2">
            <WaitingFor ctx={ctx} doneIds={[...Object.keys(state.votes ?? {}), activeId]} label="Noch nicht abgestimmt" />
          </div>
          <HostEscape ctx={ctx} label="Spieler überspringen (reagiert nicht)" action="force-skip-turn" />
        </Panel>
      )}
    </div>
  );
}

export const werBinIchModule: GameModule = {
  id: "wer-bin-ich",
  name: "Wer bin ich?",
  description: "Jeder bekommt eine geheime Identität – Ja/Nein-Fragen bis zum Aha!",
  minPlayers: 3,
  maxPlayers: 12,
  themeColor: "#ffc24d",
  icon: "🎭",
  phases: ["TURN", "RESULTS"],
  component: WerBinIch,
  threeScene: { id: "floaters", payload: { items: ["?", "🎭", "👤"], colors: ["#ffc24d", "#8b7cff"], density: 24 } },
};
