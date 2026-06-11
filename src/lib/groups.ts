"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Group, GroupMember } from "./types";

export async function createGroup(name: string): Promise<Group> {
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Nicht eingeloggt");
  const { data, error } = await sb
    .from("groups")
    .insert({ name, owner_id: auth.user.id })
    .select()
    .single();
  if (error) throw error;
  await sb.from("group_members").insert({ group_id: data.id, user_id: auth.user.id, role: "owner" });
  return data as Group;
}

export async function myGroups(): Promise<Group[]> {
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await sb
    .from("group_members")
    .select("group:groups(*)")
    .eq("user_id", auth.user.id);
  if (error) throw error;
  return ((data ?? []) as unknown as { group: Group }[]).map((r) => r.group).filter(Boolean);
}

export async function getGroup(id: string): Promise<{ group: Group; members: GroupMember[] } | null> {
  const sb = supabase();
  const [groupRes, membersRes] = await Promise.all([
    sb.from("groups").select("*").eq("id", id).maybeSingle(),
    sb.from("group_members").select("*, profile:profiles(*)").eq("group_id", id),
  ]);
  if (!groupRes.data) return null;
  return { group: groupRes.data as Group, members: (membersRes.data as GroupMember[]) ?? [] };
}

export async function joinGroupByToken(token: string): Promise<{ group_id: string; group_name: string }> {
  const { data, error } = await supabase().rpc("join_group_by_token", { p_token: token });
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) throw new Error("Ungültiger Invite-Link");
  return Array.isArray(data) ? data[0] : data;
}

/** Online-Status der Gruppenmitglieder via Realtime Presence. */
export function useGroupPresence(groupId: string | null, userId: string | null) {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!groupId || !userId) return;
    const sb = supabase();
    const channel = sb
      .channel(`presence:group:${groupId}`, { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    return () => {
      sb.removeChannel(channel);
    };
  }, [groupId, userId]);
  return online;
}
