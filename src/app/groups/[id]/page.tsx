"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { Avatar, Button, Chip, Panel, Spinner } from "@/components/ui";
import { getGroup, useGroupPresence } from "@/lib/groups";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase";
import type { GameSession, Group, GroupMember } from "@/lib/types";
import { games } from "@/games/registry";
import { useStageScene } from "@/three/ThreeStage";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [data, setData] = useState<{ group: Group; members: GroupMember[] } | null>(null);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const online = useGroupPresence(id, profile?.id ?? null);

  useStageScene("hub", { cards: games.map((g) => ({ name: g.name, color: g.themeColor })) });

  useEffect(() => {
    if (!profileLoading && !profile) router.replace(`/login?next=/groups/${id}`);
  }, [profile, profileLoading, router, id]);

  const load = useCallback(() => {
    getGroup(id).then(setData);
    supabase()
      .from("game_sessions")
      .select("*")
      .eq("group_id", id)
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .then(({ data: rows }) => setSessions((rows as GameSession[]) ?? []));
  }, [id]);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  // Live: neue Sessions/Mitglieder sofort sehen
  useEffect(() => {
    if (!profile) return;
    const sb = supabase();
    const channel = sb
      .channel(`group-watch:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: `group_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${id}` }, load)
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [id, profile, load]);

  const copyInvite = async () => {
    if (!data) return;
    const url = `${window.location.origin}/join/${data.group.invite_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = async (gameId: string) => {
    if (!profile || starting) return;
    setStarting(gameId);
    try {
      const { data: session, error } = await supabase()
        .from("game_sessions")
        .insert({ group_id: id, game_id: gameId, host_id: profile.id })
        .select()
        .single();
      if (error) throw error;
      router.push(`/play/${session.id}`);
    } finally {
      setStarting(null);
    }
  };

  if (!data) {
    return (
      <main>
        <TopBar />
        <div className="flex justify-center py-32"><Spinner /></div>
      </main>
    );
  }

  return (
    <main>
      <TopBar />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-extrabold">{data.group.name}</h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">{data.members.length} Mitglieder</p>
          </div>
          <Button variant="soft" onClick={copyInvite}>
            {copied ? "✓ Link kopiert!" : "🔗 Invite-Link kopieren"}
          </Button>
        </div>

        <Panel className="mb-6">
          <div className="scrollbar-slim flex gap-4 overflow-x-auto py-1">
            {data.members.map((m) => (
              <div key={m.user_id} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <Avatar
                  name={m.profile?.username ?? "?"}
                  hue={m.profile?.avatar_hue ?? 0}
                  size={48}
                  online={online.has(m.user_id)}
                />
                <span className="w-full truncate text-center text-xs">{m.profile?.username}</span>
              </div>
            ))}
          </div>
        </Panel>

        {sessions.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-xl font-extrabold">🔥 Läuft gerade</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {sessions.map((s) => {
                const mod = games.find((g) => g.id === s.game_id);
                if (!mod) return null;
                const canClose = profile && (s.host_id === profile.id || data.group.owner_id === profile.id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--bg-2)]/80 p-4 transition-all hover:scale-[1.01]"
                    style={{ boxShadow: `0 8px 40px -16px ${mod.themeColor}66` }}
                  >
                    <button
                      onClick={() => router.push(`/play/${s.id}`)}
                      className="flex flex-1 cursor-pointer items-center gap-4 text-left"
                    >
                      <span className="text-3xl">{mod.icon}</span>
                      <span className="flex-1">
                        <span className="display block font-bold" style={{ color: mod.themeColor }}>{mod.name}</span>
                        <span className="text-xs text-[var(--fg-muted)]">
                          {s.status === "lobby" ? "Lobby offen – beitreten!" : "Läuft…"}
                        </span>
                      </span>
                      <Chip>{s.status === "lobby" ? "Lobby" : s.phase}</Chip>
                    </button>
                    {canClose && (
                      <button
                        aria-label="Session schließen"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`${mod.name}-Session wirklich schließen?`)) return;
                          await supabase().from("game_sessions").delete().eq("id", s.id);
                          load();
                        }}
                        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] text-[var(--fg-muted)] transition-colors hover:border-coral hover:text-coral"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="mb-3 text-xl font-extrabold">🎮 Spiel starten</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g, i) => (
            <motion.button
              key={g.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -6, rotateX: 5, rotateY: -5, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => startGame(g.id)}
              disabled={!!starting}
              className="card-3d cursor-pointer rounded-3xl border border-[var(--line)] bg-[var(--bg-2)]/80 p-5 text-left backdrop-blur-xl disabled:opacity-50"
              style={{ boxShadow: `0 8px 40px -16px ${g.themeColor}55` }}
            >
              <span className="text-3xl">{starting === g.id ? <Spinner /> : g.icon}</span>
              <h3 className="mt-2 font-bold" style={{ color: g.themeColor }}>{g.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--fg-muted)]">{g.description}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                {g.minPlayers}–{g.maxPlayers} Spieler
              </p>
            </motion.button>
          ))}
        </div>
      </div>
    </main>
  );
}
