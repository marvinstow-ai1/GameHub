"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Publishable Werte – können im Client liegen. Override via .env.local möglich.
const FALLBACK_URL = "https://kymlvbdppfmnehzgdeij.supabase.co";
const FALLBACK_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bWx2YmRwcGZtbmVoemdkZWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTYyNTYsImV4cCI6MjA5NjczMjI1Nn0.MdM1I0eyGBBtyKob4I0pghLEi0TkPW92W284ZvxZpz0";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_ANON;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}
