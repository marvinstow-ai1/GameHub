"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { Button, Input, Panel, Spinner, cn } from "@/components/ui";
import { signInEmail, signInGuest, signUpEmail, validUsername } from "@/lib/auth";
import { useStageScene } from "@/three/ThreeStage";

type Mode = "guest" | "login" | "register";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/groups";

  const [mode, setMode] = useState<Mode>("guest");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "guest") {
        if (!validUsername(username)) throw new Error("2–24 Zeichen, nur Buchstaben/Zahlen/_-");
        await signInGuest(username.trim());
        router.push(next);
      } else if (mode === "login") {
        await signInEmail(email.trim(), password);
        router.push(next);
      } else {
        if (!validUsername(username)) throw new Error("Username: 2–24 Zeichen, nur Buchstaben/Zahlen/_-");
        const { needsConfirmation } = await signUpEmail(email.trim(), password, username.trim());
        if (needsConfirmation) setInfo("Check deine Mails und bestätige deine Adresse – dann kannst du dich einloggen.");
        else router.push(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <TopBar />
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="mb-2 text-4xl font-extrabold">Rein mit dir.</h1>
          <p className="mb-6 text-[var(--fg-muted)]">Nur ein Username reicht – E-Mail ist optional.</p>
          <Panel glow>
            <div className="mb-5 flex gap-1 rounded-2xl bg-[var(--bg-3)] p-1">
              {([
                ["guest", "Nur Username"],
                ["login", "Login"],
                ["register", "Registrieren"],
              ] as [Mode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "display flex-1 rounded-xl px-2 py-2 text-sm font-bold transition-all cursor-pointer",
                    mode === m ? "bg-[var(--accent)] text-[#0e0e10]" : "text-[var(--fg-muted)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode !== "login" && (
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  maxLength={24}
                />
              )}
              {mode !== "guest" && (
                <>
                  <Input
                    type="email"
                    placeholder="E-Mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    type="password"
                    placeholder="Passwort (min. 8 Zeichen)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </>
              )}
              {error && <p className="text-sm text-coral">{error}</p>}
              {info && <p className="text-sm text-mint">{info}</p>}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Spinner /> : mode === "guest" ? "Los geht's" : mode === "login" ? "Einloggen" : "Account erstellen"}
              </Button>
            </form>
          </Panel>
        </motion.div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  useStageScene("floaters", { items: ["🎮", "🎲", "🃏", "✦"], colors: ["#c8f135", "#4dc9ff", "#ff6bb5"], density: 18 });
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
