import { gcFetcher } from "./fetcher/getGcData";
import db from "./store/db";
import { average, isRadiant } from "./util/utility";

const DEFAULT_RATING = 4000;
const kFactor = 32;

async function doRate() {
    while(true) {
        const { rows } = await db.raw<{rows: { id: number, match_id: number, pgroup: PGroup, radiant_win: boolean}[]}>('SELECT id, match_id, pgroup, radiant_win from rating_queue order by id ASC LIMIT 1');
        const row = rows[0];
        if (!row) {
            // No rows, wait and try again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Fetch gcdata
        const { data: gcMatch } = await gcFetcher.getOrFetchDataWithRetry(row.match_id, { pgroup: row.pgroup });
        if (!gcMatch) {
            throw new Error('no gcdata found for match ' + row.match_id);
        }
        // Get ratings of all players in the match, otherwise default value
        const accountIds = gcMatch.players.map(p => p.account_id);
        // console.log(accountIds);
        const { rows: existingRatings } = await db.raw<{rows: {account_id: number, computed_mmr: number}[]}>(`SELECT account_id, computed_mmr FROM player_computed_mmr WHERE account_id IN (${accountIds.map(_ => '?').join(',')})`, [...accountIds]);
        const ratingMap = new Map<number, number>();
        existingRatings.forEach((r) => {
            ratingMap.set(r.account_id, r.computed_mmr);
        });
        // compute team averages
        const currRating1 = average(gcMatch.players.filter(p => isRadiant(p)).map(p => ratingMap.get(p.account_id!) ?? DEFAULT_RATING));
        const currRating2 = average(gcMatch.players.filter(p => !isRadiant(p)).map(p => ratingMap.get(p.account_id!) ?? DEFAULT_RATING));
        // apply elo formula to get delta
        const r1 = 10 ** (currRating1 / 400);
        const r2 = 10 ** (currRating2 / 400);
        const e1 = r1 / (r1 + r2);
        const e2 = r2 / (r1 + r2);
        const win1 = Number(row.radiant_win);
        const win2 = Number(!row.radiant_win);
        const ratingDiff1 = kFactor * (win1 - e1);
        const ratingDiff2 = kFactor * (win2 - e2);
        // Start transaction
        await db.raw('BEGIN TRANSACTION');
        // Rate each player
        console.log('match %s, radiant_win: %s', row.match_id, row.radiant_win);
        for (let i = 0; i < gcMatch.players.length; i++) {
            const p = gcMatch.players[i];
            const oldRating = (ratingMap.get(p.account_id!) ?? DEFAULT_RATING);
            const delta = isRadiant(p) ? ratingDiff1 : ratingDiff2;
            // apply delta to each player (all players on a team will have the same rating change)
            const newRating = oldRating + delta;
            console.log('account_id: %s, oldRating: %s, newRating: %s, delta: %s', p.account_id, oldRating, newRating, delta);
            // Write ratings back to players
            await db.raw('INSERT INTO player_computed_mmr(account_id, computed_mmr) VALUES(?, ?) ON CONFLICT DO UPDATE SET computed_mmr = EXCLUDED.computed_mmr', [newRating, p.account_id]);
        }
        // Delete row
        await db.raw('DELETE FROM rating_queue WHERE id = ?', row.id);
        // Commit transaction
        await db.raw('COMMIT');
    }
}

doRate();