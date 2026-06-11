export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_hue: number;
  games_played: number;
  wins: number;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  invite_token: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profile?: Profile;
}

export type SessionStatus = "lobby" | "running" | "finished";

export interface GameSession {
  id: string;
  group_id: string;
  game_id: string;
  host_id: string;
  status: SessionStatus;
  phase: string;
  // Spielspezifischer, host-verwalteter State
  state: Record<string, unknown>;
  winner_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SessionPlayer {
  session_id: string;
  user_id: string;
  score: number;
  joined_at: string;
  profile?: Profile;
}

/** Ein Mitspieler aus Sicht eines Spiels (Profil + Live-Infos). */
export interface PlayerInfo {
  id: string;
  username: string;
  hue: number;
  score: number;
  online: boolean;
}
