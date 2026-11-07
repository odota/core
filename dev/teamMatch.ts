import db, { upsert } from "../svc/store/db.ts";

const { rows: matches } = await db.query(
  "SELECT radiant_team_id, dire_team_id, match_id FROM matches",
);
matches.forEach((match: any) => {
  console.log(match.match_id);
  const arr: any[] = [];
  if (match.radiant_team_id) {
    arr.push({
      team_id: match.radiant_team_id,
      match_id: match.match_id,
      radiant: true,
    });
  }
  if (match.dire_team_id) {
    arr.push({
      team_id: match.dire_team_id,
      match_id: match.match_id,
      radiant: false,
    });
  }
  arr.forEach(async (tm) => {
    await upsert(db, "team_match", tm, {
      team_id: tm.team_id,
      match_id: tm.match_id,
    });
  });
});
