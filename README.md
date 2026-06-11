# 🎮 Game Hub

Multiplayer-Web-App für Freundesgruppen: **13 Spiele**, Echtzeit-Sync für alle, Three.js-Ambiente überall.

## Spiele

| Spiel | Spieler | Kurzbeschreibung |
|---|---|---|
| 🐺 Werwolf | 5–18 | Rollen, Nacht/Tag-Phasen, Seherin & Hexe, Abstimmungen |
| 🧠 Quiz-Battle | 2–16 | Multiple Choice mit Schnelligkeits-Bonus |
| 📞 Gartic Phone | 4–12 | Schreiben → Zeichnen → Beschreiben → Lachen |
| 🌍 Stadt Land Fluss | 2–12 | Zufalls-Buchstabe, 5 Kategorien, Stopp-Mechanik |
| 🌶️ Hot Take Voting | 3–16 | Quiplash-Style: Antworten einreichen, anonym voten |
| 🕵️ Codenames Light | 4–16 | 5×5-Grid, zwei Teams, Ein-Wort-Hinweise |
| 🤫 Alias / Tabu | 4–16 | Wörter erklären ohne Tabuwörter, Team-Buzzer |
| 🍾 Wahrheit oder Pflicht | 2–16 | 200+ Fragen/Aufgaben, Pflicht-Timer |
| 🙊 Never Have I Ever | 3–20 | Geständnis-Runden mit Punktesystem |
| 🎭 Wer bin ich? | 3–12 | Geheime Identität, Ja/Nein-Voting der Gruppe |
| 🎧 Blind Test | 2–16 | Song-Buzzer mit YouTube-Integration & Song-Pool |
| 🎱 Custom Bingo | 3–16 | Eigene Aussagen, zufällige 4×4-Boards |
| 🏆 Ranking Battle | 3–12 | Alle ranken die Gruppe – wer trifft den Durchschnitt? |

Alle Frage-/Wort-Pools (≈1.600 Einträge, Deutsch) liegen in Supabase-Tabellen und werden pro Runde zufällig gezogen.

## Tech-Stack

- **Next.js (App Router) + TypeScript**, Tailwind CSS v4
- **Three.js** (direkt, ohne R3F): globaler Hintergrund-Canvas mit Szenen-Registry, 3D-Timer-Ring, Lobby-Orbs, Konfetti+Trophäe, Vollmond-Szene für Werwolf, Parallax auf Pointer, DPR-/Resize-aware, pausiert bei `prefers-reduced-motion`
- **Supabase**: Auth (E-Mail oder nur Username), Postgres mit RLS, Realtime (postgres_changes + Broadcast + Presence)
- **GSAP + Framer Motion** für UI-Transitions, **Zustand** für Stage-State

## Architektur

- Jedes Spiel ist ein isoliertes `GameModule` (`src/games/<id>/index.tsx`), registriert in `src/games/registry.ts`. Kein Spiel kennt ein anderes.
- **State-Machine:** `LOBBY → <Spielphasen> → RESULTS`, Phase + State liegen in `game_sessions` (jsonb).
- **Host-autoritatives Sync** (`src/lib/gameSync.ts`): Spieler senden Aktionen per Realtime-Broadcast, der Host reduziert sie in den State und schreibt in die DB, alle Clients erhalten Updates via `postgres_changes`. Presence steuert Online-Status und automatische **Host-Migration**.
- Tab kurz zu? Kein Problem – Session bleibt (Supabase Auth Persistence) und der Spielstand liegt in der DB.
- Spielinterne Navigation spiegelt die Phase in den URL-Hash.

## Setup

```bash
pnpm install
cp .env.example .env.local   # Werte sind bereits eingetragen (publishable)
pnpm dev
```

Das Schema + alle Seeds liegen in `supabase/migrations/` (bereits auf das Projekt `kymlvbdppfmnehzgdeij` angewendet).

### Supabase-Auth-Konfiguration (einmalig, im Dashboard)

Für den „nur Username“-Login muss **eine** der beiden Optionen aktiv sein (Dashboard → Authentication → Sign In / Up):

1. **Anonymous sign-ins aktivieren** (empfohlen) – der Guest-Login nutzt dann anonyme Accounts, oder
2. **„Confirm email“ deaktivieren** – der Guest-Login fällt auf synthetische E-Mail-Adressen zurück.

E-Mail+Passwort-Accounts funktionieren unabhängig davon immer.

## Neues Spiel hinzufügen

1. Ordner `src/games/mein-spiel/` mit `index.tsx` anlegen, `GameModule` exportieren.
2. In `src/games/registry.ts` registrieren.
3. Optional: eigene Three.js-Szene in `src/three/scenes/` registrieren oder die generische `floaters`-Szene parametrisieren.
4. Optional: Content-Tabelle anlegen und in `get_random_content` whitelisten.
