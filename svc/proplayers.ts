// Updates the list of pro players in the database
import db, { upsert } from "./store/db.ts";
import { runInLoop } from "./store/queue.ts";

await runInLoop(
  async function proPlayers() {
    const url =
      "http://www.dota2.com/webapi/IDOTA2Fantasy/GetProPlayerInfo/v001";
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch pro players: ${resp.status}`);
    }
    const data = await resp.json();
    const apiPros = data.player_infos;
    console.log("[PROPLAYERS]", apiPros.length, "players");
    for (let p of apiPros) {
      await upsert(db, "notable_players", p, {
        account_id: p.account_id,
      });
    }
  },
  30 * 60 * 1000,
);
