"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Input, Panel, cn } from "@/components/ui";
import { HostEscape, PhaseHeader, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

const STATEMENTS_PER_PLAYER = 3;
const BOARD = 4; // 4x4

interface BingoState {
  pool: string[];
  submitted: string[];
  /** boards[uid] = 16 Statements */
  boards: Record<string, string[]>;
  /** marks[uid] = bool[16] */
  marks: Record<string, boolean[]>;
  [key: string]: unknown;
}

function hasBingo(marks: boolean[]): boolean {
  for (let r = 0; r < BOARD; r++) {
    if (Array.from({ length: BOARD }, (_, c) => marks[r * BOARD + c]).every(Boolean)) return true;
    if (Array.from({ length: BOARD }, (_, c) => marks[c * BOARD + r]).every(Boolean)) return true;
  }
  if (Array.from({ length: BOARD }, (_, i) => marks[i * BOARD + i]).every(Boolean)) return true;
  if (Array.from({ length: BOARD }, (_, i) => marks[i * BOARD + (BOARD - 1 - i)]).every(Boolean)) return true;
  return false;
}

function CustomBingo({ ctx }: GameProps) {
  const state = ctx.state as BingoState;
  const { phase, self, isHost, players } = ctx;
  const [inputs, setInputs] = useState<string[]>(Array(STATEMENTS_PER_PLAYER).fill(""));
  const initRef = useRef(false);

  useEffect(() => {
    if (!isHost || phase !== "COLLECT" || state.pool || initRef.current) return;
    initRef.current = true;
    ctx.commit({ state: { pool: [], submitted: [], boards: {}, marks: {} } });
  }, [isHost, phase, state.pool, ctx]);

  useHostActions(ctx, async (action, snap) => {
    const s = snap.state as BingoState;
    if (!s.pool) return;

    const buildBoards = async (pool: string[], submitted: string[]) => {
      // Pool ggf. mit Seed-Statements auffüllen und Boards bauen
      let fullPool = [...new Set(pool)];
      const need = BOARD * BOARD;
      if (fullPool.length < need) {
        const extra = await ctx.fetchContent<{ text: string }>("bingo_statements", need * 2);
        fullPool = [...new Set([...fullPool, ...extra.map((e) => e.text)])];
      }
      const boards: Record<string, string[]> = {};
      const marks: Record<string, boolean[]> = {};
      for (const p of players) {
        boards[p.id] = [...fullPool].sort(() => Math.random() - 0.5).slice(0, need);
        marks[p.id] = Array(need).fill(false);
      }
      await ctx.commit({ state: { ...s, pool: fullPool, submitted, boards, marks }, phase: "PLAY" });
    };

    if (action.type === "submit-statements" && snap.phase === "COLLECT") {
      if (s.submitted.includes(action.from)) return;
      const pool = [...s.pool, ...(action.data as string[])];
      const submitted = [...s.submitted, action.from];
      const everyone = players.every((p) => submitted.includes(p.id) || !p.online);
      if (everyone) await buildBoards(pool, submitted);
      else ctx.commit({ state: { ...s, pool, submitted } });
    }
    if (action.type === "force-build" && snap.phase === "COLLECT") {
      await buildBoards(s.pool, s.submitted);
    }
    if (action.type === "mark" && snap.phase === "PLAY") {
      const { index, value } = action.data as { index: number; value: boolean };
      const myMarks = [...(s.marks[action.from] ?? [])];
      myMarks[index] = value;
      const marks = { ...s.marks, [action.from]: myMarks };
      ctx.commit({ state: { ...s, marks } });
    }
    if (action.type === "claim" && snap.phase === "PLAY") {
      const myMarks = s.marks[action.from] ?? [];
      if (hasBingo(myMarks)) {
        ctx.endGame([action.from]);
      }
    }
  });

  if (!state.pool) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Bingo-Karten werden gemischt… 🎱</Panel>;
  }

  if (phase === "COLLECT") {
    const done = state.submitted?.includes(self.id);
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <PhaseHeader
          icon="🎱"
          title="Aussagen sammeln"
          subtitle={`Schreib ${STATEMENTS_PER_PLAYER} Dinge, die heute Abend passieren könnten („X verschüttet was“)`}
        />
        <div className="flex flex-col gap-3">
          {inputs.map((value, i) => (
            <Input
              key={i}
              placeholder={`Aussage ${i + 1}…`}
              value={value}
              disabled={done}
              maxLength={80}
              onChange={(e) => {
                const next = [...inputs];
                next[i] = e.target.value;
                setInputs(next);
              }}
            />
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          size="lg"
          disabled={done || inputs.some((v) => !v.trim())}
          onClick={() => ctx.send("submit-statements", inputs.map((v) => v.trim()))}
        >
          {done ? "Abgegeben ✓" : "Abschicken"}
        </Button>
        <div className="mt-3">
          <WaitingFor ctx={ctx} doneIds={state.submitted ?? []} />
        </div>
        <HostEscape ctx={ctx} label="Boards jetzt erstellen (Rest wird aufgefüllt)" action="force-build" />
      </div>
    );
  }

  if (phase === "PLAY") {
    const board = state.boards?.[self.id] ?? [];
    const marks = state.marks?.[self.id] ?? [];
    const canClaim = hasBingo(marks);
    return (
      <div className="mx-auto max-w-lg px-4 pt-6">
        <PhaseHeader icon="🎱" title="Dein Bingo-Board" subtitle="Markiere, was passiert – 4 in einer Reihe = BINGO!" />
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {board.map((statement, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.92 }}
              onClick={() => ctx.send("mark", { index: i, value: !marks[i] })}
              className={cn(
                "flex aspect-square cursor-pointer items-center justify-center rounded-xl border p-1.5 text-center text-[9px] font-semibold leading-tight transition-all sm:text-[11px]",
                marks[i]
                  ? "border-transparent bg-[var(--accent)] text-[#0e0e10]"
                  : "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]"
              )}
            >
              {statement}
            </motion.button>
          ))}
        </div>
        <motion.div animate={canClaim ? { scale: [1, 1.04, 1] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}>
          <Button className="mt-5 w-full" size="lg" disabled={!canClaim} onClick={() => ctx.send("claim")}>
            {canClaim ? "🎉 BINGO!" : "Noch kein Bingo…"}
          </Button>
        </motion.div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players
            .filter((p) => p.id !== self.id)
            .map((p) => (
              <Panel key={p.id} className="p-3">
                <p className="mb-1 truncate text-xs font-bold">{p.username}</p>
                <div className="grid grid-cols-4 gap-0.5">
                  {(state.marks?.[p.id] ?? Array(16).fill(false)).map((m: boolean, i: number) => (
                    <span key={i} className={cn("aspect-square rounded-sm", m ? "bg-[var(--accent)]" : "bg-[var(--bg-3)]")} />
                  ))}
                </div>
              </Panel>
            ))}
        </div>
      </div>
    );
  }

  return null;
}

export const customBingoModule: GameModule = {
  id: "custom-bingo",
  name: "Custom Bingo",
  description: "Ihr schreibt die Aussagen, jeder kriegt ein zufälliges Board – Bingo!",
  minPlayers: 3,
  maxPlayers: 16,
  themeColor: "#58d68d",
  icon: "🎱",
  phases: ["COLLECT", "PLAY", "RESULTS"],
  component: CustomBingo,
  threeScene: { id: "floaters", payload: { items: ["🎱", "✓", "B", "I", "N", "G", "O"], colors: ["#58d68d", "#c8f135"], density: 26 } },
};
