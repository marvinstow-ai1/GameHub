"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Input, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

type CardColor = "red" | "blue" | "neutral" | "assassin";

interface CodenamesState {
  words: string[];
  colors: CardColor[];
  revealed: boolean[];
  teams: { red: string[]; blue: string[] };
  spymasters: { red: string; blue: string };
  turn: "red" | "blue";
  clue?: { word: string; count: number } | null;
  guessesLeft: number;
  [key: string]: unknown;
}

const TEAM_LABEL = { red: "Rot", blue: "Blau" } as const;

function buildBoard(): { colors: CardColor[] } {
  const colors: CardColor[] = [
    ...Array<CardColor>(9).fill("red"),
    ...Array<CardColor>(8).fill("blue"),
    ...Array<CardColor>(7).fill("neutral"),
    "assassin",
  ];
  colors.sort(() => Math.random() - 0.5);
  return { colors };
}

function Codenames({ ctx }: GameProps) {
  const state = ctx.state as CodenamesState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState(2);

  useEffect(() => {
    if (!isHost || phase !== "PLAY" || state.words || initRef.current) return;
    initRef.current = true;
    (async () => {
      const rows = await ctx.fetchContent<{ word: string }>("codenames_words", 25);
      const shuffled = [...players.map((p) => p.id)].sort(() => Math.random() - 0.5);
      const half = Math.ceil(shuffled.length / 2);
      const red = shuffled.slice(0, half);
      const blue = shuffled.slice(half);
      const { colors } = buildBoard();
      ctx.commit({
        state: {
          words: rows.map((r) => r.word),
          colors,
          revealed: Array(25).fill(false),
          teams: { red, blue },
          spymasters: { red: red[0], blue: blue[0] },
          turn: "red",
          clue: null,
          guessesLeft: 0,
        },
      });
    })();
  }, [isHost, phase, state.words, players, ctx]);

  useHostActions(ctx, (action, snap) => {
    const s = snap.state as CodenamesState;
    if (!s.words) return;

    if (action.type === "force-pass") {
      ctx.commit({ state: { ...s, clue: null, guessesLeft: 0, turn: s.turn === "red" ? "blue" : "red" } });
      return;
    }
    if (action.type === "clue" && action.from === s.spymasters[s.turn] && !s.clue) {
      const { word, count } = action.data as { word: string; count: number };
      ctx.commit({ state: { ...s, clue: { word, count }, guessesLeft: count + 1 } });
    }

    if (action.type === "reveal" && s.clue) {
      const index = action.data as number;
      if (s.revealed[index]) return;
      // nur Ratende des aktiven Teams (nicht der Spymaster)
      if (!s.teams[s.turn].includes(action.from) || action.from === s.spymasters[s.turn]) return;
      const revealed = [...s.revealed];
      revealed[index] = true;
      const color = s.colors[index];

      if (color === "assassin") {
        ctx.commit({ state: { ...s, revealed } });
        ctx.endGame(s.teams[s.turn === "red" ? "blue" : "red"]);
        return;
      }
      const redLeft = s.colors.filter((c, i) => c === "red" && !revealed[i]).length;
      const blueLeft = s.colors.filter((c, i) => c === "blue" && !revealed[i]).length;
      if (redLeft === 0 || blueLeft === 0) {
        ctx.commit({ state: { ...s, revealed } });
        ctx.endGame(redLeft === 0 ? s.teams.red : s.teams.blue);
        return;
      }
      const hit = color === s.turn;
      const guessesLeft = hit ? s.guessesLeft - 1 : 0;
      if (guessesLeft > 0) {
        ctx.commit({ state: { ...s, revealed, guessesLeft } });
      } else {
        ctx.commit({ state: { ...s, revealed, clue: null, guessesLeft: 0, turn: s.turn === "red" ? "blue" : "red" } });
      }
    }

    if (action.type === "pass" && s.teams[s.turn].includes(action.from) && s.clue) {
      ctx.commit({ state: { ...s, clue: null, guessesLeft: 0, turn: s.turn === "red" ? "blue" : "red" } });
    }
  });

  if (!state.words) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Agenten gehen in Stellung… 🕵️</Panel>;
  }

  const myTeam: "red" | "blue" = state.teams.red.includes(self.id) ? "red" : "blue";
  const amSpymaster = state.spymasters.red === self.id || state.spymasters.blue === self.id;
  const myTurn = state.turn === myTeam;
  const canGuess = myTurn && !amSpymaster && !!state.clue;
  const spymasterName = (team: "red" | "blue") => players.find((p) => p.id === state.spymasters[team])?.username;

  const cardStyle = (i: number) => {
    const revealedColor = {
      red: "bg-[#ff5c4d] text-white border-transparent",
      blue: "bg-[#4dc9ff] text-[#0e0e10] border-transparent",
      neutral: "bg-[var(--bg-3)] text-[var(--fg-muted)] border-transparent",
      assassin: "bg-black text-white border-coral",
    }[state.colors[i]];
    if (state.revealed[i]) return revealedColor;
    if (amSpymaster) {
      return {
        red: "border-[#ff5c4d]/70 bg-[var(--bg-2)]",
        blue: "border-[#4dc9ff]/70 bg-[var(--bg-2)]",
        neutral: "border-[var(--line)] bg-[var(--bg-2)] opacity-70",
        assassin: "border-white bg-black/40",
      }[state.colors[i]];
    }
    return "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]";
  };

  const redLeft = state.colors.filter((c, i) => c === "red" && !state.revealed[i]).length;
  const blueLeft = state.colors.filter((c, i) => c === "blue" && !state.revealed[i]).length;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <Chip className={cn("border-[#ff5c4d]", state.turn === "red" && "bg-[#ff5c4d]/20")}>
          🔴 Rot · {redLeft} übrig {myTeam === "red" && "· du"}
        </Chip>
        <Chip className={cn("border-[#4dc9ff]", state.turn === "blue" && "bg-[#4dc9ff]/20")}>
          🔵 Blau · {blueLeft} übrig {myTeam === "blue" && "· du"}
        </Chip>
      </div>

      <PhaseHeader
        icon="🕵️"
        title={state.clue ? `Hinweis: „${state.clue.word}“ – ${state.clue.count}` : `Team ${TEAM_LABEL[state.turn]} ist dran`}
        subtitle={
          state.clue
            ? `Noch ${state.guessesLeft} Versuch${state.guessesLeft === 1 ? "" : "e"}`
            : `${spymasterName(state.turn)} (Geheimdienstchef) überlegt sich einen Ein-Wort-Hinweis…`
        }
      />

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {state.words.map((w, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.015 }}
            whileTap={canGuess && !state.revealed[i] ? { scale: 0.92 } : undefined}
            disabled={!canGuess || state.revealed[i]}
            onClick={() => ctx.send("reveal", i)}
            className={cn(
              "flex aspect-[4/3] cursor-pointer items-center justify-center rounded-lg border p-1 text-center text-[10px] font-bold uppercase leading-tight transition-all sm:rounded-xl sm:text-xs",
              cardStyle(i)
            )}
          >
            {w}
          </motion.button>
        ))}
      </div>

      {amSpymaster && myTurn && !state.clue && (
        <Panel className="mt-4">
          <p className="mb-2 text-sm font-bold">Dein Ein-Wort-Hinweis:</p>
          <div className="flex gap-2">
            <Input placeholder="Hinweis" value={clueWord} onChange={(e) => setClueWord(e.target.value.replace(/\s/g, ""))} />
            <Input
              type="number"
              min={1}
              max={9}
              className="w-20"
              value={clueCount}
              onChange={(e) => setClueCount(parseInt(e.target.value) || 1)}
            />
            <Button disabled={!clueWord.trim()} onClick={() => ctx.send("clue", { word: clueWord.trim(), count: clueCount })}>
              Geben
            </Button>
          </div>
        </Panel>
      )}

      {canGuess && (
        <Button variant="ghost" className="mt-4 w-full" onClick={() => ctx.send("pass")}>
          Zug beenden →
        </Button>
      )}
      {amSpymaster && <Chip className="mx-auto mt-3 flex w-fit">🤫 Du bist Geheimdienstchef – nicht spoilern!</Chip>}
      <HostEscape ctx={ctx} label="Zug ans andere Team geben (Team reagiert nicht)" action="force-pass" />
    </div>
  );
}

export const codenamesModule: GameModule = {
  id: "codenames",
  name: "Codenames Light",
  description: "5×5-Wortgrid, zwei Teams, Ein-Wort-Hinweise – und ein Attentäter.",
  minPlayers: 4,
  maxPlayers: 16,
  themeColor: "#5ee0e6",
  icon: "🕵️",
  phases: ["PLAY", "RESULTS"],
  component: Codenames,
  threeScene: { id: "floaters", payload: { items: ["🕵️", "🔴", "🔵", "■"], colors: ["#5ee0e6", "#ff5c4d", "#4dc9ff"], density: 22 } },
};
