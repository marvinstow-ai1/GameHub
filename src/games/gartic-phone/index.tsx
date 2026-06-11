"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Chip, Input, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { PhaseHeader, WaitingFor, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";
import { DrawingCanvas } from "./DrawingCanvas";

/**
 * Chain-Logik: chains[c][s] = Eintrag von Schritt s in Kette c.
 * Schritt 0: Prompt schreiben. Danach abwechselnd Zeichnen/Beschreiben.
 * In Schritt s bearbeitet Spieler order[(c + s) % N] die Kette c.
 * Zeichnungen liegen in der Tabelle gartic_drawings (zu groß für den State).
 */
interface ChainEntry {
  kind: "text" | "draw";
  value?: string;
  ref?: number;
  author: string;
}

interface GarticState {
  order: string[];
  step: number;
  chains: ChainEntry[][];
  /** Reveal: aktuelle Kette + Schritt */
  reveal?: { chain: number; upTo: number };
  [key: string]: unknown;
}

function chainForPlayer(state: GarticState, uid: string): number {
  const n = state.order.length;
  const i = state.order.indexOf(uid);
  return ((i - state.step) % n + n) % n;
}

function Drawing({ refId }: { refId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    supabase()
      .from("gartic_drawings")
      .select("data")
      .eq("id", refId)
      .maybeSingle()
      .then(({ data }) => setSrc((data as { data: string } | null)?.data ?? null));
  }, [refId]);
  if (!src) return <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-[var(--bg-3)]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Zeichnung" className="w-full rounded-2xl border border-[var(--line)] bg-white" />;
}

function GarticPhone({ ctx }: GameProps) {
  const state = ctx.state as GarticState;
  const { phase, self, isHost, players } = ctx;
  const initRef = useRef(false);
  const [text, setText] = useState("");
  const [drawingData, setDrawingData] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isHost || phase !== "WORK" || state.order || initRef.current) return;
    initRef.current = true;
    ctx.commit({
      state: {
        order: [...players.map((p) => p.id)].sort(() => Math.random() - 0.5),
        step: 0,
        chains: players.map(() => []),
      },
    });
  }, [isHost, phase, state.order, players, ctx]);

  const [prevStep, setPrevStep] = useState(state.step);
  if (prevStep !== state.step) {
    setPrevStep(state.step);
    setText("");
    setDrawingData(null);
    setSubmitted(false);
  }

  useHostActions(ctx, (action) => {
    const s = ctx.state as GarticState;
    if (action.type === "submit" && phase === "WORK") {
      const { chain, entry } = action.data as { chain: number; entry: ChainEntry };
      if (s.chains[chain]?.length !== s.step) return; // schon abgegeben
      const chains = s.chains.map((c, i) => (i === chain ? [...c, entry] : c));
      const allDone = chains.every((c) => c.length === s.step + 1);
      if (!allDone) {
        ctx.commit({ state: { ...s, chains } });
        return;
      }
      const nextStep = s.step + 1;
      if (nextStep >= s.order.length) {
        ctx.commit({ state: { ...s, chains, reveal: { chain: 0, upTo: 0 } }, phase: "REVEAL" });
      } else {
        ctx.commit({ state: { ...s, chains, step: nextStep } });
      }
    }
  });

  if (!state.order) {
    return <Panel className="mx-auto mt-16 max-w-sm text-center">Stille Post wird aufgebaut… 📞</Panel>;
  }

  /* ---------- WORK: schreiben / zeichnen / beschreiben ---------- */
  if (phase === "WORK") {
    const myChain = chainForPlayer(state, self.id);
    const chain = state.chains[myChain] ?? [];
    const iDone = chain.length > state.step;
    const isPromptStep = state.step === 0;
    const iDraw = !isPromptStep && state.step % 2 === 1;
    const previous = chain[state.step - 1];
    const doneIds = state.order.filter((uid) => (state.chains[chainForPlayer({ ...state, order: state.order } as GarticState, uid) ] ?? []).length > state.step);

    const submit = async () => {
      if (submitted) return;
      setSubmitted(true);
      if (iDraw) {
        const { data, error } = await supabase()
          .from("gartic_drawings")
          .insert({ session_id: ctx.session.id, author_id: self.id, step: state.step, chain: myChain, data: drawingData })
          .select("id")
          .single();
        if (error || !data) {
          setSubmitted(false);
          return;
        }
        ctx.send("submit", { chain: myChain, entry: { kind: "draw", ref: data.id, author: self.id } });
      } else {
        ctx.send("submit", { chain: myChain, entry: { kind: "text", value: text.trim(), author: self.id } });
      }
    };

    return (
      <div className="mx-auto max-w-lg px-4 pt-6">
        <PhaseHeader
          icon="📞"
          title={isPromptStep ? "Denk dir was aus!" : iDraw ? "Zeichne das:" : "Was siehst du hier?"}
          subtitle={`Schritt ${state.step + 1} von ${state.order.length}`}
        />
        {iDone || submitted ? (
          <Panel className="py-10 text-center">
            <p className="text-lg font-bold">Abgegeben ✓</p>
            <div className="mt-3">
              <WaitingFor ctx={ctx} doneIds={iDone ? doneIds : [...doneIds, self.id]} />
            </div>
          </Panel>
        ) : (
          <>
            {previous && previous.kind === "text" && (
              <Panel glow className="mb-4 py-6 text-center">
                <p className="text-xl font-bold">„{previous.value}“</p>
              </Panel>
            )}
            {previous && previous.kind === "draw" && previous.ref !== undefined && (
              <div className="mb-4"><Drawing refId={previous.ref} /></div>
            )}
            {iDraw ? (
              <>
                <DrawingCanvas onChange={setDrawingData} />
                <Button className="mt-4 w-full" size="lg" disabled={!drawingData} onClick={submit}>
                  Zeichnung abgeben
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder={isPromptStep ? "z.B. Ein Pinguin im Fitnessstudio" : "Beschreibe die Zeichnung…"}
                  value={text}
                  maxLength={90}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && text.trim() && submit()}
                />
                <Button disabled={!text.trim()} onClick={submit}>Senden</Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ---------- REVEAL: Ketten nacheinander aufdecken ---------- */
  if (phase === "REVEAL" && state.reveal) {
    const { chain: chainIndex, upTo } = state.reveal;
    const chain = state.chains[chainIndex] ?? [];
    const advance = () => {
      const s = ctx.state as GarticState;
      const r = s.reveal!;
      if (r.upTo + 1 < (s.chains[r.chain]?.length ?? 0)) {
        ctx.commit({ state: { ...s, reveal: { ...r, upTo: r.upTo + 1 } } });
      } else if (r.chain + 1 < s.chains.length) {
        ctx.commit({ state: { ...s, reveal: { chain: r.chain + 1, upTo: 0 } } });
      } else {
        ctx.endGame(players.map((p) => p.id));
      }
    };

    return (
      <div className="mx-auto max-w-lg px-4 pt-6">
        <PhaseHeader icon="🎬" title={`Kette ${chainIndex + 1} von ${state.chains.length}`} subtitle="Das große Aufdecken!" />
        <div className="flex flex-col gap-4">
          {chain.slice(0, upTo + 1).map((entry, i) => {
            const author = players.find((p) => p.id === entry.author);
            return (
              <motion.div key={i} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                <p className="mb-1 text-xs font-bold text-[var(--fg-muted)]">
                  {i === 0 ? "✍️" : entry.kind === "draw" ? "🎨" : "🔍"} {author?.username}
                </p>
                {entry.kind === "text" ? (
                  <Panel><p className="text-lg font-bold">„{entry.value}“</p></Panel>
                ) : (
                  entry.ref !== undefined && <Drawing refId={entry.ref} />
                )}
              </motion.div>
            );
          })}
        </div>
        {isHost ? (
          <Button className="mt-6 w-full" onClick={advance}>Weiter →</Button>
        ) : (
          <Chip className="mx-auto mt-6 flex w-fit">Der Host deckt auf…</Chip>
        )}
      </div>
    );
  }

  return null;
}

export const garticPhoneModule: GameModule = {
  id: "gartic-phone",
  name: "Gartic Phone",
  description: "Stille Post mit Stift: schreiben → zeichnen → raten → lachen.",
  minPlayers: 4,
  maxPlayers: 12,
  themeColor: "#b06bff",
  icon: "📞",
  phases: ["WORK", "REVEAL", "RESULTS"],
  component: GarticPhone,
  threeScene: { id: "floaters", payload: { items: ["✏️", "🎨", "📞", "🖌️"], colors: ["#b06bff", "#ff6bb5"], density: 22 } },
};
