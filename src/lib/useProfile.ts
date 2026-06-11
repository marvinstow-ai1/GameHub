"use client";

import { useEffect, useState } from "react";
import { getMyProfile } from "./auth";
import { supabase } from "./supabase";
import type { Profile } from "./types";

let cached: Profile | null = null;

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (cancelled) return;
      cached = p;
      setProfile(p);
      setLoading(false);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        cached = null;
        setProfile(null);
      } else if (event === "SIGNED_IN") {
        getMyProfile().then((p) => {
          if (!cancelled) {
            cached = p;
            setProfile(p);
          }
        });
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { profile, loading };
}
