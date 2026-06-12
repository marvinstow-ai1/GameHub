"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Input, Panel } from "@/components/ui";
import {
  HostEscape,
  PhaseHeader,
  ScoreStrip,
  SharedTimer,
  WaitingFor,
  clearedTimer,
  timerFields,
  useHostActions,
} from "../kit";
import type { GameModule, GameProps, GameState } from "../types";
import { setting } from "../types";

const LETTERS = "ABCDEFGHIJKLMNOPRSTUVWZ";
const DEFAULT_CATEGORIES = ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"];
/** Klassische Regel: Nach "Stopp!" haben alle anderen noch kurz Zeit, den Stift fallen zu lassen. */
const STOP_GRACE_MS = 3000;

interface SlfState extends GameState {
  categories: string[];
  letter: string;
  usedLetters: string[];
  round: number;
  /** answers[round][uid] = string[] */
  answers: Record<string, Record<string, string[]>>;
  submitted: string[];
  scores: Record<string, number>;
  stoppedBy?: string | null;
  roundDone?: boolean;
  timerEnd?: number;
  timerTotal?: number;
}

/**
 * Klassisches Stadt-Land-Fluss-Scoring:
 *  20 Punkte – als Einzige(r) eine gültige Antwort in der Kategorie
 *  10 Punkte – gültige Antwort, die kein anderer hat
 *   5 Punkte – gültige Antwort, die auch jemand anderes hat
 *   0 Punkte – leer oder falscher Anfangsbuchstabe
 */
function scoreRound(answers: Record<string, string[]>, letter: string, categories: string[]) {
  const scores: Record<string, number> = {};
  const detail: Record<string, number[]> = {};
  const uids = Object.keys(answers);
  for (const uid of uids) {
    scores[uid] = 0;
    detail[uid] = [];
  }
  categories.forEach((_, ci) => {
    const normalized: Record<string, string> = {};
    for (const uid of uids) {
      const raw = (answers[uid]?.[ci] ?? "").trim().toLowerCase();
      normalized[uid] = raw.startsWith(letter.toLowerCase()) && raw.length > 1 ? raw : "";
    }
    const validCount = Object.values(normalized).filter(Boolean).length;
    for (const uid of uids) {
      const value = normalized[uid];
      let pts = 0;
      if (value) {
        const dup = Object.entries(normalized).some(([other, v]) => other !== uid && v === value);
        if (!dup && validCount === 1) pts = 20;
        else if (!dup) pts = 10;
        else pts = 5;
      }
      scores[uid] += pts;
      detail[uid].push(pts);
    }
  });
  return { scores, detail };
}

function newRound(s: SlfState | GameState, categories: string[], round: number): SlfState {
  const used = ((s as SlfState).usedLetters ?? []) as string[];
  const available = LETTERS.split("").filter((l) => !used.includes(l));
  const letter = available[Math.floor(Math.random() * available.length)] ?? LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return {
    ...(s as SlfState),
    categories,
    letter,
    usedLetters: [...used, letter],
    round,
    submitted: [],
    stoppedBy: null,
    roundDone: false,
    ...timerFields(setting(s, "seconds", 90)),
  };
}

/** Kategorien je nach Lobby-Einstellung: eigene Liste oder zufällig aus dem Pool. */
async function pickCategories(ctx: GameProps["ctx"]): Promise<string[]> {
  const mode = setting<string>(ctx.state, "mode", "random");
  const custom = setting<string[]>(ctx.state, "categories", DEFAULT_CATEGORIES);
  if (mode === "custom" && custom.length >= 2) return custom.slice(0, 8);
  const count = Math.min(Math.max(custom.length, 5), 8);
  const cats = await ctx.fetchContent<{ name: string }>("slf_categories", count);
  return cats.map((c) => c.name);
}

function StadtLandFluss({ ctx }: GameProps) {
  const state = ctx.state as SlfState;
  const { phase, self, isHost, players } = ctx;
  const totalRounds = setting(ctx.state, "rounds", 3);
  const [inputs, setInputs] = useState<string[]>(() => Array(8).fill(""));
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const initRef = useRef(false);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Host: erste Runde initialisieren
  useEffect(() => {
    if (!isHost || phase !== "WRITE" || state.letter || initRef.current) return;
    initRef.current = true;
    (async () => {
      const cats = await pickCategories(ctx);
      ctx.commit({
        state: (s) => ({ ...newRound(s, cats, 1), answers: {}, scores: {} }),
      });
    })();
  }, [isHost, phase, state.letter, ctx]);

  // Neue Runde → lokale Eingaben zurücksetzen
  const [prevRound, setPrevRound] = useState(state.round ?? 0);
  if (prevRound !== (state.round ?? 0)) {
    setPrevRound(state.round ?? 0);
    setInputs(Array(state.categories?.length ?? 8).fill(""));
    setLocalSubmitted(false);
  }

  const iSubmitted = localSubmitted || (state.submitted ?? []).includes(self.id);
  const inputsRef = useRef(inputs);
  const submittedRef = useRef(iSubmitted);
  useEffect(() => {
    inputsRef.current = inputs;
    submittedRef.current = iSubmitted;
  }, [inputs, iSubmitted]);

  // Host-Reducer: alle Aktionen seriell, immer auf frischem Snapshot
  useHostActions(ctx, (action, snap) => {
    const s = snap.state as SlfState;
    if (snap.phase !== "WRITE" || s.roundDone) return;

    const finalize = (answers: SlfState["answers"]) => {
      if (graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = null;
      }
      const roundAnswers = answers[String(s.round)] ?? {};
      const { scores } = scoreRound(roundAnswers, s.letter, s.categories);
      const total = { ...s.scores };
      for (const [uid, pts] of Object.entries(scores)) total[uid] = (total[uid] ?? 0) + pts;
      return ctx.commit({
        state: (cur) => ({ ...cur, answers, scores: total, roundDone: true, ...clearedTimer() }),
        phase: "REVIEW",
      });
    };

    if (action.type === "submit") {
      const roundKey = String(s.round);
      const answers = {
        ...s.answers,
        [roundKey]: { ...(s.answers?.[roundKey] ?? {}), [action.from]: action.data as string[] },
      };
      const submitted = [...new Set([...(s.submitted ?? []), action.from])];
      const everyone = players.every((p) => submitted.includes(p.id) || !p.online);
      if (everyone) {
        finalize(answers);
      } else {
        ctx.commit({ state: (cur) => ({ ...cur, answers, submitted }) });
      }
    }

    if (action.type === "stop" && !s.stoppedBy) {
      // Stopp! – Timer für alle sofort auf 0, kurze Gnadenfrist, dann wird gewertet
      ctx.commit({
        state: (cur) => ({ ...cur, stoppedBy: action.from, timerEnd: Date.now(), timerTotal: s.timerTotal }),
      });
      ctx.sendEvent("force-submit");
      graceRef.current = setTimeout(() => ctx.send("finalize"), STOP_GRACE_MS);
    }

    if (action.type === "finalize" || action.type === "force-finish") {
      finalize(s.answers ?? {});
    }
  });

  // Alle Clients: Bei "Stopp" (oder Timer-Ende) eigene (Teil-)Antworten sofort abschicken
  useEffect(() => {
    return ctx.onEvent((event) => {
      if (event.type === "force-submit" && !submittedRef.current && phase === "WRITE") {
        submittedRef.current = true;
        setLocalSubmitted(true);
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

  // Host: nächste Runde / Spielende
  const nextRound = async () => {
    const s = ctx.state as SlfState;
    if (s.round >= totalRounds) {
      const best = Math.max(...players.map((p) => s.scores[p.id] ?? 0));
      ctx.endGame(players.filter((p) => (s.scores[p.id] ?? 0) === best).map((p) => p.id), s.scores);
      return;
    }
    const cats = await pickCategories(ctx);
    ctx.commit({
      state: (cur) => newRound(cur, cats, (cur as SlfState).round + 1),
      phase: "WRITE",
    });
  };

  if (!state.letter || !state.categories) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Kategorien werden gezogen… ✍️</Panel>;
  }

  const stopper = players.find((p) => p.id === state.stoppedBy);

  if (phase === "WRITE") {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <PhaseHeader
          icon="✍️"
          title={`Buchstabe: ${state.letter}`}
          subtitle={`Runde ${state.round} von ${totalRounds} – wer zuerst fertig ist, drückt Stopp!`}
        />
        <div className="mb-4 flex flex-col items-center gap-2">
          <SharedTimer ctx={ctx} color="#4dc9ff" size={90} onDone={() => ctx.send("stop")} />
          {stopper && (
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
              <Chip className="border-coral text-coral">🛑 {stopper.username} hat gestoppt – Stifte fallen lassen!</Chip>
            </motion.div>
          )}
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
        <HostEscape ctx={ctx} label="Runde jetzt auswerten" action="force-finish" />
      </div>
    );
  }

  if (phase === "REVIEW") {
    const roundAnswers = state.answers?.[String(state.round)] ?? {};
    const { detail } = scoreRound(roundAnswers, state.letter, state.categories);
    const isLast = state.round >= totalRounds;
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <PhaseHeader
          icon="📊"
          title={`Auswertung – Runde ${state.round}`}
          subtitle="20 = einzige gültige Antwort · 10 = einzigartig · 5 = doppelt · 0 = ungültig"
        />
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
                        <span className={pts === 0 ? "text-[var(--fg-muted)] line-through" : pts >= 10 ? "font-bold text-mint" : ""}>
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
        {isHost ? (
          <Button className="mt-6 w-full" onClick={nextRound}>
            {isLast ? "🏁 Endergebnis" : "Nächste Runde →"}
          </Button>
        ) : (
          <Chip className="mx-auto mt-6 flex w-fit">Warte auf den Host…</Chip>
        )}
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
  settings: [
    {
      key: "mode",
      label: "Kategorien",
      type: "select",
      options: [
        { value: "random", label: "🎲 Zufällig aus dem Pool" },
        { value: "custom", label: "✏️ Eigene Liste" },
      ],
      default: "random",
    },
    {
      key: "categories",
      label: "Eigene Kategorien (bei „Eigene Liste“)",
      type: "tags",
      default: ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"],
      placeholder: "z.B. Pokémon, Kneipe, Ausrede…",
      help: "2–8 Kategorien. Bei „Zufällig“ bestimmt die Anzahl, wie viele gezogen werden.",
    },
    { key: "rounds", label: "Runden", type: "number", min: 1, max: 10, default: 3 },
    { key: "seconds", label: "Zeit pro Runde", type: "number", min: 30, max: 180, step: 15, default: 90, unit: "s" },
  ],
  component: StadtLandFluss,
  threeScene: {
    id: "floaters",
    payload: { items: "ABCDEFGHKLMNORSTUW".split(""), colors: ["#4dc9ff", "#8b7cff", "#3ee6a8"], density: 30 },
  },
};
