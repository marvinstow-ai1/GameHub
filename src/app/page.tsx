"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { TopBar } from "@/components/TopBar";
import { useProfile } from "@/lib/useProfile";
import { useStageScene } from "@/three/ThreeStage";
import { games } from "@/games/registry";
import { Chip } from "@/components/ui";

export default function HomePage() {
  const { profile } = useProfile();
  useStageScene("hub", {
    cards: games.map((g) => ({ name: g.name, color: g.themeColor })),
  });

  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!heroRef.current) return;
    const targets = heroRef.current.querySelectorAll("[data-stagger]");
    gsap.fromTo(
      targets,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, stagger: 0.12, ease: "power3.out" }
    );
  }, []);

  return (
    <main>
      <TopBar />
      <section ref={heroRef} className="mx-auto flex min-h-[70dvh] max-w-4xl flex-col items-center justify-center gap-6 px-4 text-center">
        <Chip data-stagger>13 Spiele · Realtime · für deine Crew</Chip>
        <h1 data-stagger className="text-5xl font-extrabold leading-[1.05] sm:text-7xl">
          Ein Hub.
          <br />
          <span style={{ color: "var(--accent)" }}>Dreizehn Spiele.</span>
          <br />
          Null Ausreden.
        </h1>
        <p data-stagger className="max-w-md text-lg text-[var(--fg-muted)]">
          Werwolf, Quiz-Battle, Gartic Phone &amp; mehr – direkt im Browser, synchron für alle. Gruppe erstellen, Link teilen, los.
        </p>
        <div data-stagger className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={profile ? "/groups" : "/login"}
            className="display rounded-2xl bg-[var(--accent)] px-8 py-4 text-lg font-bold text-[#0e0e10] shadow-[0_4px_32px_var(--accent-soft)] transition-transform hover:scale-105"
          >
            {profile ? "Zu deinen Gruppen" : "Jetzt loslegen"}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-6 text-2xl font-extrabold">Die Spiele</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: (i % 4) * 0.06 }}
              whileHover={{ y: -6, rotateX: 4, rotateY: -4 }}
              className="card-3d rounded-3xl border border-[var(--line)] bg-[var(--bg-2)]/80 p-5 backdrop-blur-xl"
              style={{ boxShadow: `0 8px 40px -16px ${g.themeColor}55` }}
            >
              <span className="text-3xl">{g.icon}</span>
              <h3 className="mt-2 font-bold" style={{ color: g.themeColor }}>
                {g.name}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{g.description}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                {g.minPlayers}–{g.maxPlayers} Spieler
              </p>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
