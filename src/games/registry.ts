import type { GameModule } from "./types";
import { werwolfModule } from "./werwolf";
import { stadtLandFlussModule } from "./stadt-land-fluss";
import { wahrheitPflichtModule } from "./wahrheit-pflicht";
import { neverHaveIEverModule } from "./never-have-i-ever";
import { werBinIchModule } from "./wer-bin-ich";
import { quizBattleModule } from "./quiz-battle";
import { blindTestModule } from "./blind-test";
import { garticPhoneModule } from "./gartic-phone";
import { tabuModule } from "./tabu";
import { codenamesModule } from "./codenames";
import { customBingoModule } from "./custom-bingo";
import { hotTakesModule } from "./hot-takes";
import { rankingModule } from "./ranking";

/**
 * Zentrale Game-Library. Neue Spiele: Modul-Ordner anlegen,
 * GameModule exportieren, hier registrieren – fertig.
 * Kein Spiel kennt ein anderes.
 */
export const games: GameModule[] = [
  werwolfModule,
  quizBattleModule,
  garticPhoneModule,
  stadtLandFlussModule,
  hotTakesModule,
  codenamesModule,
  tabuModule,
  wahrheitPflichtModule,
  neverHaveIEverModule,
  werBinIchModule,
  blindTestModule,
  customBingoModule,
  rankingModule,
];

export function gameById(id: string): GameModule | undefined {
  return games.find((g) => g.id === id);
}
