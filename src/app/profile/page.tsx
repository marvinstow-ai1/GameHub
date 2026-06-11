"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Avatar, Button, Panel, Spinner } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { useProfile } from "@/lib/useProfile";
import { useStageScene } from "@/three/ThreeStage";

export default function ProfilePage() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  useStageScene("floaters", { items: ["★", "✦"], colors: ["#ffc24d", "#c8f135"], density: 14 });

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
  }, [loading, profile, router]);

  if (!profile) {
    return (
      <main>
        <TopBar />
        <div className="flex justify-center py-32"><Spinner /></div>
      </main>
    );
  }

  const winRate = profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;

  return (
    <main>
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Avatar name={profile.username} hue={profile.avatar_hue} size={96} />
          <h1 className="text-3xl font-extrabold">{profile.username}</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            dabei seit {new Date(profile.created_at).toLocaleDateString("de")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Spiele", profile.games_played],
            ["Siege", profile.wins],
            ["Winrate", `${winRate}%`],
          ].map(([label, value]) => (
            <Panel key={label} className="py-6 text-center">
              <p className="display text-3xl font-extrabold" style={{ color: "var(--accent)" }}>{value}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
            </Panel>
          ))}
        </div>
        <Button
          variant="ghost"
          className="mt-8 w-full"
          onClick={async () => {
            await signOut();
            router.push("/");
          }}
        >
          Ausloggen
        </Button>
      </div>
    </main>
  );
}
