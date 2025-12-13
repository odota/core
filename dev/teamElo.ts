/**
 * Computes team Elo ratings by game
 * */
import db from "../svc/store/db.ts";

// Keep each team's rating in memory and update
const teams = new Map<string, number>();
const wins = new Map<string, number>();
const losses = new Map<string, number>();
const startTimes = new Map<string, number>();
const kFactor = 32;
// Read a stream from the database
const stream = db
  .raw(
    `
SELECT team_match.team_id team_id1, tm2.team_id team_id2, matches.match_id, team_match.radiant = radiant_win team1_win, start_time
FROM team_match
JOIN matches using(match_id)
JOIN team_match tm2 on team_match.match_id = tm2.match_id AND team_match.team_id < tm2.team_id
WHERE matches.radiant_team_id IS NOT NULL AND matches.dire_team_id IS NOT NULL
ORDER BY match_id ASC
`,
  )
  .stream();
stream.on("data", (match) => {
  // console.log(JSON.stringify(match));
  if (!teams.has(match.team_id1)) {
    teams.set(match.team_id1, 1000);
  }
  if (!teams.has(match.team_id2)) {
    teams.set(match.team_id2, 1000);
  }
  if (!wins.has(match.team_id1)) {
    wins.set(match.team_id1, 0);
  }
  if (!wins.has(match.team_id2)) {
    wins.set(match.team_id2, 0);
  }
  if (!losses.has(match.team_id1)) {
    losses.set(match.team_id1, 0);
  }
  if (!losses.has(match.team_id2)) {
    losses.set(match.team_id2, 0);
  }
  startTimes.set(match.team_id1, match.start_time);
  startTimes.set(match.team_id2, match.start_time);
  const currRating1 = teams.get(match.team_id1)!;
  const currRating2 = teams.get(match.team_id2)!;
  const r1 = 10 ** (currRating1 / 400);
  const r2 = 10 ** (currRating2 / 400);
  const e1 = r1 / (r1 + r2);
  const e2 = r2 / (r1 + r2);
  const win1 = Number(match.team1_win);
  const win2 = Number(!win1);
  const ratingDiff1 = kFactor * (win1 - e1);
  const ratingDiff2 = kFactor * (win2 - e2);
  teams.set(match.team_id1, teams.get(match.team_id1)! + ratingDiff1);
  teams.set(match.team_id2, teams.get(match.tem_id2)! + ratingDiff2);
  wins.set(match.team_id1, wins.get(match.team_id1)! + win1);
  wins.set(match.team_id2, wins.get(match.team_id2)! + win2);
  losses.set(match.team_id1, losses.get(match.team_id1)! + Number(!win1));
  losses.set(match.team_id2, losses.get(match.team_id2)! + Number(!win2));
});
stream.on("end", () => {
  console.log(teams, wins, losses, startTimes);
  // Write the results to table
  Object.keys(teams).forEach((teamId) => {
    console.log([
      teamId,
      teams.get(teamId),
      wins.get(teamId),
      losses.get(teamId),
      startTimes.get(teamId),
    ]);
    db.raw(
      `INSERT INTO team_rating(team_id, rating, wins, losses, last_match_time) VALUES(?, ?, ?, ?, ?)
  ON CONFLICT(team_id) DO UPDATE SET team_id=EXCLUDED.team_id, rating=EXCLUDED.rating, wins=EXCLUDED.wins, losses=EXCLUDED.losses, last_match_time=EXCLUDED.last_match_time`,
      [
        teamId,
        teams.get(teamId),
        wins.get(teamId),
        losses.get(teamId),
        startTimes.get(teamId),
      ],
    );
  });
});
stream.on("error", (err) => {
  throw err;
});
