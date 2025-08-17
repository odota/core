import config from '../../config';
import cassandra, { getCassandraColumns } from '../store/cassandra';
import { computeMatchData } from './compute';
import type { InsertMatchInput } from './types';
import {
  createMatchCopy,
  getAnonymousAccountId,
  redisCount,
  serialize,
} from './utility';
import { promises as fs } from 'node:fs';
import util from 'node:util';

export async function upsertPlayerCaches(
  match: InsertMatchInput | ParsedMatch | Match,
  averageRank: number | undefined,
  pgroup: PGroup,
  type: DataType,
) {
  // Add the 10 player_match rows indexed by player
  // We currently do this on all types
  const copy = createMatchCopy<Match>(match);
  if (averageRank) {
    copy.average_rank = averageRank;
  }
  const columns = await getCassandraColumns('player_caches');
  return Promise.all(
    copy.players.map(async (p) => {
      // add account id to each player so we know what caches to update
      const account_id = pgroup[p.player_slot]?.account_id;
      // join player with match to form player_match
      const playerMatch: Partial<ParsedPlayerMatch> = {
        ...p,
        ...copy,
        account_id,
        players: undefined,
      };
      if (
        !playerMatch.account_id ||
        playerMatch.account_id === getAnonymousAccountId()
      ) {
        return false;
      }
      if (type === 'api' || type === 'reconcile') {
        // We currently update this for the non-anonymous players in the match
        // It'll reflect the current anonymity state of the players at insertion time
        // This might lead to changes in peers counts after a fullhistory update or parse request
        // When reconciling after gcdata we will update this with non-anonymized data (but we won't reconcile for players with open match history so their peers may be incomplete)
        playerMatch.heroes = pgroup;
      }
      computeMatchData(playerMatch as ParsedPlayerMatch);
      // Remove extra properties
      Object.keys(playerMatch).forEach((key) => {
        if (!columns[key]) {
          delete playerMatch[key as keyof ParsedPlayerMatch];
        }
      });
      const serializedMatch: any = serialize(playerMatch);
      if (
        (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') &&
        (playerMatch.player_slot === 0 || type === 'reconcile')
      ) {
        await fs.writeFile(
          './json/' +
            copy.match_id +
            `_playercache_${type}_${playerMatch.player_slot}.json`,
          JSON.stringify(serializedMatch, null, 2),
        );
      }
      if (type === 'reconcile') {
        console.log(
          playerMatch.account_id,
          copy.match_id,
          playerMatch.player_slot,
        );
        redisCount('reconcile');
      }
      const query = util.format(
        'INSERT INTO player_caches (%s) VALUES (%s)',
        Object.keys(serializedMatch).join(','),
        Object.keys(serializedMatch)
          .map(() => '?')
          .join(','),
      );
      const arr = Object.keys(serializedMatch).map((k) => serializedMatch[k]);
      await cassandra.execute(query, arr, {
        prepare: true,
      });
      return true;
    }),
  );
}
