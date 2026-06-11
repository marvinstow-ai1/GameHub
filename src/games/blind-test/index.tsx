"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Chip, Input, Panel } from "@/components/ui";
import { PhaseHeader, ScoreStrip, useHostActions } from "../kit";
import type { GameModule, GameProps } from "../types";

interface BlindState {
  round: number;
  /** Eingebettetes YouTube-Video (nur Host-Gerät spielt den Sound) */
  videoId?: string | null;
  songHint?: { title: string; artist: string } | null;
  buzzedBy?: string | null;
  scores: Record<string, number>;
  playing: boolean;
  [key: string]: unknown;
}

function parseYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function BlindTest({ ctx }: GameProps) {
  const state = ctx.state as BlindState;
  const { phase, isHost, players } = ctx;
  const [url, setUrl] = useState("");
  const [flash, setFlash] = useState(false);

  // Buzzer-Blitz für alle (ephemer, ohne DB-Roundtrip)
  useEffect(() => {
    return ctx.onEvent((event) => {
      if (event.type === "buzz-flash") {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    });
  }, [ctx]);

  useHostActions(ctx, (action) => {
    const s = ctx.state as BlindState;
    if (action.type === "buzz" && phase === "PLAY" && s.playing && !s.buzzedBy) {
      ctx.sendEvent("buzz-flash");
      ctx.commit({ state: { ...s, buzzedBy: action.from } });
    }
  });

  const loadSong = async (videoUrl?: string) => {
    const s = ctx.state as BlindState;
    if (videoUrl) {
      const id = parseYouTubeId(videoUrl);
      if (!id) return;
      ctx.commit({ state: { ...s, videoId: id, songHint: null, buzzedBy: null, playing: true, round: (s.round ?? 0) + 1 } });
    } else {
      const [song] = await ctx.fetchContent<{ title: string; artist: string }>("blindtest_songs", 1);
      ctx.commit({ state: { ...s, videoId: null, songHint: song, buzzedBy: null, playing: true, round: (s.round ?? 0) + 1 } });
    }
    setUrl("");
  };

  const judge = (correct: boolean) => {
    const s = ctx.state as BlindState;
    if (!s.buzzedBy) return;
    const scores = { ...s.scores };
    if (correct) {
      scores[s.buzzedBy] = (scores[s.buzzedBy] ?? 0) + 1;
      ctx.commit({ state: { ...s, scores, playing: false, buzzedBy: null } });
    } else {
      scores[s.buzzedBy] = (scores[s.buzzedBy] ?? 0) - 0; // falsch = kein Abzug, nur wieder freigeben
      ctx.commit({ state: { ...s, scores, buzzedBy: null } });
    }
  };

  const buzzer = players.find((p) => p.id === state.buzzedBy);

  return (
    <div className={`mx-auto max-w-xl px-4 pt-6 transition-colors ${flash ? "animate-pulse" : ""}`}>
      <PhaseHeader
        icon="🎧"
        title={`Blind Test – Runde ${state.round ?? 0}`}
        subtitle={isHost ? "Dein Gerät spielt die Musik – dreh auf!" : "Hör hin und buzzer, wenn du's weißt!"}
      />

      {isHost && (
        <Panel className="mb-4">
          <p className="mb-2 text-sm font-bold text-[var(--fg-muted)]">🎵 Song laden</p>
          <div className="flex gap-2">
            <Input placeholder="YouTube-Link einfügen…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button disabled={!parseYouTubeId(url)} onClick={() => loadSong(url)}>Play</Button>
          </div>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => loadSong()}>
            🎲 Zufälliger Song aus dem Pool
          </Button>
          {state.videoId && state.playing && (
            <div className="mt-3 overflow-hidden rounded-2xl">
              <iframe
                width="100%"
                height="200"
                src={`https://www.youtube.com/embed/${state.videoId}?autoplay=1`}
                title="Blind Test Song"
                allow="autoplay; encrypted-media"
              />
            </div>
          )}
          {state.songHint && state.playing && (
            <Panel className="mt-3 border-[var(--accent)]">
              <p className="text-sm">
                Spiele ab (nur du siehst das): <strong>{state.songHint.artist} – {state.songHint.title}</strong>
              </p>
              <a
                className="text-xs underline"
                target="_blank"
                rel="noreferrer"
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${state.songHint.artist} ${state.songHint.title}`)}`}
              >
                Auf YouTube suchen ↗
              </a>
            </Panel>
          )}
        </Panel>
      )}

      {state.playing ? (
        buzzer ? (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
          <Panel glow className="py-8 text-center">
            <Avatar name={buzzer.username} hue={buzzer.hue} size={64} className="mx-auto" />
            <p className="mt-3 text-xl font-extrabold">🚨 {buzzer.username} hat gebuzzert!</p>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">Antwort laut sagen – der Host entscheidet.</p>
            {isHost && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="ghost" onClick={() => judge(false)}>✗ Falsch – weiter</Button>
                <Button onClick={() => judge(true)}>✓ Richtig (+1)</Button>
              </div>
            )}
          </Panel>
          </motion.div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => ctx.send("buzz")}
            className="mx-auto block h-48 w-48 cursor-pointer rounded-full bg-coral text-white shadow-[0_0_80px_-10px_#ff5c4d] transition-transform hover:scale-105"
          >
            <span className="text-5xl">🔔</span>
            <p className="display mt-2 text-xl font-extrabold">BUZZ!</p>
          </motion.button>
        )
      ) : (
        <Panel className="py-10 text-center">
          <p className="text-lg font-bold">{(state.round ?? 0) === 0 ? "Warte auf den ersten Song… 🎶" : "Nächster Song kommt gleich… 🎶"}</p>
          {!isHost && <Chip className="mt-2">Der Host legt auf</Chip>}
        </Panel>
      )}

      <div className="mt-6">
        <ScoreStrip ctx={ctx} scores={state.scores ?? {}} />
      </div>
      {isHost && (state.round ?? 0) >= 1 && (
        <Button
          variant="ghost"
          className="mt-4 w-full"
          onClick={() => {
            const scores = (ctx.state as BlindState).scores ?? {};
            const best = Math.max(0, ...players.map((p) => scores[p.id] ?? 0));
            ctx.endGame(players.filter((p) => (scores[p.id] ?? 0) === best && best > 0).map((p) => p.id), scores);
          }}
        >
          🏁 Spiel beenden
        </Button>
      )}
    </div>
  );
}

export const blindTestModule: GameModule = {
  id: "blind-test",
  name: "Blind Test",
  description: "Song läuft, Buzzer bereit – wer erkennt den Track zuerst?",
  minPlayers: 2,
  maxPlayers: 16,
  themeColor: "#3ee6a8",
  icon: "🎧",
  phases: ["PLAY", "RESULTS"],
  component: BlindTest,
  threeScene: { id: "floaters", payload: { items: ["🎵", "🎶", "🎧", "♪"], colors: ["#3ee6a8", "#4dc9ff"], density: 26 } },
};
