"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { GameSession, PlayerInfo, Profile, SessionPlayer } from "./types";
import type { CommitPatch, GameAction, GameCtx, GameState } from "@/games/types";

/**
 * Host-autoritatives Sync-Modell:
 *  - Spieler senden Aktionen als Broadcast über den Session-Channel
 *  - Der Host reduziert Aktionen in den State und schreibt ihn in game_sessions
 *  - Alle Clients erhalten den neuen State via postgres_changes
 *  - Presence trackt, wer online ist; fällt der Host aus, übernimmt
 *    deterministisch der "kleinste" online Spieler (Host-Migration)
 */
export function useGameSession(sessionId: string, selfProfile: Profile | null) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const actionHandlers = useRef(new Set<(a: GameAction) => void>());
  const eventHandlers = useRef(new Set<(a: GameAction) => void>());
  const commitChain = useRef<Promise<void>>(Promise.resolve());

  const selfId = selfProfile?.id ?? null;

  const loadAll = useCallback(async () => {
    const sb = supabase();
    const [sessionRes, playersRes] = await Promise.all([
      sb.from("game_sessions").select("*").eq("id", sessionId).maybeSingle(),
      sb.from("session_players").select("*, profile:profiles(*)").eq("session_id", sessionId),
    ]);
    if (sessionRes.error || !sessionRes.data) {
      setError("Session nicht gefunden – bist du in dieser Gruppe?");
      return;
    }
    setSession(sessionRes.data as GameSession);
    setPlayers((playersRes.data as SessionPlayer[]) ?? []);
  }, [sessionId]);

  // Selbst beitreten (idempotent)
  useEffect(() => {
    if (!selfId) return;
    supabase()
      .from("session_players")
      .upsert({ session_id: sessionId, user_id: selfId }, { onConflict: "session_id,user_id" })
      .then(() => loadAll());
  }, [sessionId, selfId, loadAll]);

  // Realtime: DB-Änderungen + Broadcast + Presence
  useEffect(() => {
    if (!selfId) return;
    const sb = supabase();
    const channel = sb
      .channel(`game:${sessionId}`, { config: { presence: { key: selfId }, broadcast: { self: true } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") setError("Session wurde beendet.");
          else setSession(payload.new as GameSession);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_players", filter: `session_id=eq.${sessionId}` },
        () => loadAll()
      )
      .on("broadcast", { event: "action" }, ({ payload }) => {
        const action = payload as GameAction;
        actionHandlers.current.forEach((handler) => handler(action));
      })
      .on("broadcast", { event: "live" }, ({ payload }) => {
        const event = payload as GameAction;
        eventHandlers.current.forEach((handler) => handler(event));
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    channelRef.current = channel;
    return () => {
      sb.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, selfId, loadAll]);

  // Host-Migration: Host >6s offline → kleinster online Spieler übernimmt
  useEffect(() => {
    if (!selfId) return;
    const interval = setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status === "finished") return;
      if (online.size === 0 || online.has(current.host_id)) return;
      const candidates = [...online].sort();
      if (candidates[0] === selfId) {
        supabase().from("game_sessions").update({ host_id: selfId }).eq("id", current.id)
          .eq("host_id", current.host_id).then(() => {});
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [selfId, online]);

  const send = useCallback(
    (type: string, data?: unknown) => {
      if (!selfId) return;
      channelRef.current?.send({
        type: "broadcast",
        event: "action",
        payload: { type, data, from: selfId, ts: Date.now() } satisfies GameAction,
      });
    },
    [selfId]
  );

  const sendEvent = useCallback(
    (type: string, data?: unknown) => {
      if (!selfId) return;
      channelRef.current?.send({
        type: "broadcast",
        event: "live",
        payload: { type, data, from: selfId, ts: Date.now() } satisfies GameAction,
      });
    },
    [selfId]
  );

  const onAction = useCallback((handler: (a: GameAction) => void) => {
    actionHandlers.current.add(handler);
    return () => actionHandlers.current.delete(handler);
  }, []);

  const onEvent = useCallback((handler: (a: GameAction) => void) => {
    eventHandlers.current.add(handler);
    return () => eventHandlers.current.delete(handler);
  }, []);

  // Commits werden sequenziell verkettet, damit funktionale Updates nicht verloren gehen
  const commit = useCallback(
    (patch: CommitPatch) => {
      const run = async () => {
        const current = sessionRef.current;
        if (!current) return;
        const nextState =
          typeof patch.state === "function"
            ? (patch.state as (s: GameState) => GameState)(current.state as GameState)
            : patch.state;
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (nextState !== undefined) update.state = nextState;
        if (patch.phase !== undefined) update.phase = patch.phase;
        if (patch.status !== undefined) update.status = patch.status;
        const { data } = await supabase()
          .from("game_sessions")
          .update(update)
          .eq("id", current.id)
          .select()
          .maybeSingle();
        if (data) setSession(data as GameSession);
      };
      commitChain.current = commitChain.current.then(run, run);
      return commitChain.current;
    },
    []
  );

  const endGame = useCallback(
    async (winnerIds: string[], scores?: Record<string, number>) => {
      const current = sessionRef.current;
      if (!current) return;
      await supabase()
        .from("game_sessions")
        .update({ status: "finished", phase: "RESULTS", winner_ids: winnerIds })
        .eq("id", current.id);
      if (scores) {
        await Promise.all(
          Object.entries(scores).map(([uid, score]) =>
            supabase().from("session_players").update({ score }).eq("session_id", current.id).eq("user_id", uid)
          )
        );
      }
      await supabase().rpc("record_results", { p_session_id: current.id, p_winner_ids: winnerIds });
    },
    []
  );

  const fetchContent = useCallback(async <T,>(table: string, count: number): Promise<T[]> => {
    const { data, error: rpcError } = await supabase().rpc("get_random_content", {
      p_table: table,
      p_count: count,
    });
    if (rpcError) throw rpcError;
    return (data as T[]) ?? [];
  }, []);

  const playerInfos: PlayerInfo[] = useMemo(
    () =>
      players
        .filter((p) => p.profile)
        .map((p) => ({
          id: p.user_id,
          username: p.profile!.username,
          hue: p.profile!.avatar_hue,
          score: p.score,
          online: online.has(p.user_id),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [players, online]
  );

  const self = useMemo(
    () =>
      playerInfos.find((p) => p.id === selfId) ??
      (selfProfile
        ? { id: selfProfile.id, username: selfProfile.username, hue: selfProfile.avatar_hue, score: 0, online: true }
        : null),
    [playerInfos, selfId, selfProfile]
  );

  const ctx: GameCtx | null = useMemo(() => {
    if (!session || !self) return null;
    return {
      session,
      players: playerInfos,
      self,
      isHost: session.host_id === self.id,
      phase: session.phase,
      state: session.state as GameState,
      commit,
      send,
      sendEvent,
      onAction,
      onEvent,
      endGame,
      fetchContent,
    };
  }, [session, playerInfos, self, commit, send, sendEvent, onAction, onEvent, endGame, fetchContent]);

  return { ctx, error, loading: !session && !error };
}
