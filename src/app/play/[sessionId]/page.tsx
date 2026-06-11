"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { Panel, Spinner } from "@/components/ui";
import { useGameSession } from "@/lib/gameSync";
import { useProfile } from "@/lib/useProfile";
import { gameById } from "@/games/registry";
import { LobbyView, ResultsView } from "@/games/kit";
import { PHASE_LOBBY, PHASE_RESULTS } from "@/games/types";
import { useStage } from "@/three/stage";

export default function PlayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile, loading: profileLoading } = useProfile();
  const { ctx, error, loading } = useGameSession(sessionId, profile);
  const setScene = useStage((s) => s.setScene);
  const pulse = useStage((s) => s.pulse);

  const mod = ctx ? gameById(ctx.session.game_id) : null;
  const phase = ctx?.phase ?? PHASE_LOBBY;

  // Spielinterne Navigation ohne Server: Phase landet im URL-Hash
  useEffect(() => {
    if (ctx) window.location.hash = phase;
  }, [phase, ctx]);

  // Ambiente-Szene des Spiels (außerhalb von Lobby/Results)
  useEffect(() => {
    if (!ctx || !mod) return;
    if (phase === PHASE_LOBBY || phase === PHASE_RESULTS) return; // eigene Szenen
    if (mod.threeScene) setScene(mod.threeScene.id, { accent: mod.themeColor, ...mod.threeScene.payload });
    else setScene("floaters", { items: [mod.icon], accent: mod.themeColor, colors: [mod.themeColor], density: 14 });
  }, [ctx, mod, phase, setScene]);

  // Phasen-Übergang: Partikel-Burst in der Szene
  useEffect(() => {
    pulse("burst");
  }, [phase, pulse]);

  const needsLogin = !profileLoading && !profile;
  useEffect(() => {
    if (needsLogin) window.location.href = `/login?next=/play/${sessionId}`;
  }, [needsLogin, sessionId]);

  if (profileLoading || loading) {
    return (
      <main>
        <TopBar />
        <div className="flex justify-center py-32"><Spinner /></div>
      </main>
    );
  }

  if (needsLogin) return null;

  if (error || !ctx || !mod) {
    return (
      <main>
        <TopBar />
        <div className="mx-auto max-w-md px-4 py-24">
          <Panel className="py-10 text-center">
            <p className="text-3xl">🚧</p>
            <p className="mt-3 font-bold">{error ?? "Spiel nicht gefunden"}</p>
            <Link href="/groups" className="mt-3 inline-block text-sm underline">Zurück zu den Gruppen</Link>
          </Panel>
        </div>
      </main>
    );
  }

  const GameComponent = mod.component;

  return (
    <main style={{ "--accent": mod.themeColor } as React.CSSProperties}>
      <TopBar />
      <div className="pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase === PHASE_LOBBY ? "lobby" : phase === PHASE_RESULTS ? "results" : "game"}
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 1.01 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {phase === PHASE_LOBBY ? (
              <LobbyView
                ctx={ctx}
                module={mod}
                onStart={() => ctx.commit({ status: "running", phase: mod.phases[0] ?? "RUNNING" })}
              />
            ) : phase === PHASE_RESULTS ? (
              <ResultsView ctx={ctx} module={mod} />
            ) : (
              <GameComponent ctx={ctx} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
