"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { Button, Input, Modal, Panel, Spinner } from "@/components/ui";
import { createGroup, myGroups } from "@/lib/groups";
import { useProfile } from "@/lib/useProfile";
import type { Group } from "@/lib/types";
import { useStageScene } from "@/three/ThreeStage";

export default function GroupsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useStageScene("floaters", { items: ["✦", "●", "◆"], colors: ["#c8f135", "#4dc9ff"], density: 16 });

  useEffect(() => {
    if (!profileLoading && !profile) router.replace("/login?next=/groups");
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (profile) myGroups().then(setGroups);
  }, [profile]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const group = await createGroup(name.trim());
      router.push(`/groups/${group.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <TopBar />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold">Deine Gruppen</h1>
          <Button onClick={() => setShowCreate(true)}>+ Neue Gruppe</Button>
        </div>

        {!groups ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : groups.length === 0 ? (
          <Panel className="py-14 text-center">
            <p className="text-3xl">👯</p>
            <p className="mt-3 text-lg font-bold">Noch keine Gruppe</p>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Erstelle eine Gruppe und teile den Invite-Link mit deinen Leuten.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link href={`/groups/${g.id}`}>
                  <Panel className="transition-all hover:border-[var(--accent)] hover:shadow-[0_0_40px_-10px_var(--accent-soft)]">
                    <h2 className="text-xl font-bold">{g.name}</h2>
                    <p className="mt-1 text-xs text-[var(--fg-muted)]">
                      erstellt {new Date(g.created_at).toLocaleDateString("de")}
                    </p>
                  </Panel>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Neue Gruppe">
        <div className="flex flex-col gap-3">
          <Input
            placeholder="z.B. Freitagsrunde"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            autoFocus
          />
          <Button onClick={create} disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : "Erstellen"}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
