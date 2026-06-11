"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useProfile } from "@/lib/useProfile";
import { Avatar } from "./ui";

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => true
  );
  const toggle = () => {
    document.documentElement.classList.toggle("dark", !dark);
    localStorage.setItem("gh-theme", !dark ? "dark" : "light");
  };
  return (
    <button
      onClick={toggle}
      aria-label="Theme wechseln"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg-2)] text-lg transition-transform hover:scale-105 cursor-pointer"
    >
      {dark ? "☾" : "☀"}
    </button>
  );
}

export function TopBar() {
  const { profile } = useProfile();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="display text-xl font-extrabold tracking-tight">
          Game<span style={{ color: "var(--accent)" }}>Hub</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {profile ? (
            <Link href="/profile" className="flex items-center gap-2">
              <Avatar name={profile.username} hue={profile.avatar_hue} size={40} />
            </Link>
          ) : (
            <Link
              href="/login"
              className="display rounded-2xl bg-[var(--accent)] px-4 py-2 font-bold text-[#0e0e10]"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
