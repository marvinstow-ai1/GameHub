"use client";

import { supabase } from "./supabase";
import type { Profile } from "./types";

/** Username-only Accounts laufen über eine synthetische E-Mail-Adresse. */
const GUEST_DOMAIN = "guest.gamehub.app";

function guestEmail(username: string) {
  return `${username.toLowerCase().replace(/[^a-z0-9_-]/g, "")}@${GUEST_DOMAIN}`;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validUsername(name: string) {
  return /^[a-zA-Z0-9_\-äöüÄÖÜß]{2,24}$/.test(name.trim());
}

export async function signUpEmail(email: string, password: string, username: string) {
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signInEmail(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Login nur mit Username: zuerst anonymer Login (falls im Projekt aktiviert),
 * sonst Fallback auf synthetische E-Mail + lokal gespeichertes Passwort.
 */
export async function signInGuest(username: string) {
  const sb = supabase();
  const anon = await sb.auth.signInAnonymously({ options: { data: { username } } });
  if (!anon.error) return;

  const email = guestEmail(username);
  const stored = localStorage.getItem(`gh-guest-pw:${email}`);
  if (stored) {
    const { error } = await sb.auth.signInWithPassword({ email, password: stored });
    if (!error) return;
  }
  const password = randomPassword();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      throw new Error("Username ist vergeben. Wähle einen anderen oder logge dich per E-Mail ein.");
    }
    throw error;
  }
  localStorage.setItem(`gh-guest-pw:${email}`, password);
  if (!data.session) {
    throw new Error(
      'Für Username-Logins muss in Supabase entweder "Anonymous sign-ins" aktiviert oder "Confirm email" deaktiviert sein.'
    );
  }
}

export async function signOut() {
  await supabase().auth.signOut();
}

export async function getMyProfile(): Promise<Profile | null> {
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (data) return data as Profile;
  // Fallback: Profil anlegen, falls der DB-Trigger es (noch) nicht erstellt hat
  const username =
    (auth.user.user_metadata?.username as string | undefined) ??
    `spieler-${auth.user.id.slice(0, 6)}`;
  const { data: created } = await sb
    .from("profiles")
    .upsert({ id: auth.user.id, username, avatar_hue: Math.floor(Math.random() * 360) })
    .select()
    .maybeSingle();
  return (created as Profile) ?? null;
}
