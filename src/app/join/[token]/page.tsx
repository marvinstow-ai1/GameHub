"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Panel, Spinner } from "@/components/ui";
import { joinGroupByToken } from "@/lib/groups";
import { useProfile } from "@/lib/useProfile";
import { useStageScene } from "@/three/ThreeStage";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useStageScene("floaters", { items: ["👋", "✦", "🎉"], colors: ["#3ee6a8", "#4dc9ff"], density: 16 });

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace(`/login?next=/join/${token}`);
      return;
    }
    if (attempted.current) return;
    attempted.current = true;
    joinGroupByToken(token)
      .then((res) => router.replace(`/groups/${res.group_id}`))
      .catch((err) => setError(err instanceof Error ? err.message : "Beitritt fehlgeschlagen"));
  }, [profile, loading, token, router]);

  return (
    <main>
      <TopBar />
      <div className="mx-auto flex min-h-[70dvh] max-w-md items-center justify-center px-4">
        <Panel className="w-full py-12 text-center" glow>
          {error ? (
            <>
              <p className="text-3xl">😕</p>
              <p className="mt-3 font-bold">{error}</p>
            </>
          ) : (
            <>
              <Spinner className="mx-auto" />
              <p className="mt-4 font-bold">Du trittst der Gruppe bei…</p>
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}
