// Updates the list of leagues in the database
import axios from "axios";
import db, { upsert } from "./store/db.ts";
import { runInLoop } from "./util/utility.ts";

await runInLoop(
  async function leagues() {
    const url =
      "http://www.dota2.com/webapi/IDOTA2League/GetLeagueInfoList/v001";
    const resp = await axios.get<Leagues>(url);
    const apiLeagues: LeagueToInsert[] = resp.data.infos;
    console.log("[LEAGUES]", apiLeagues.length, "leagues");
    for (let league of apiLeagues) {
      const openQualifierTier =
        league.name.indexOf("Open Qualifier") === -1 ? null : "excluded";
      let eventTier = "excluded";
      if (Number(league.tier) === 2) {
        eventTier = "professional";
      } else if (Number(league.tier) >= 3) {
        eventTier = "premium";
      }
      if (league.league_id === 4664) {
        eventTier = "premium";
      }
      league.tier = openQualifierTier ?? eventTier;
      league.ticket = null;
      league.banner = null;
      league.leagueid = league.league_id;
      await upsert(db, "leagues", league, {
        leagueid: league.league_id,
      });
    }
  },
  30 * 60 * 1000,
);
