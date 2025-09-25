import { MatchFetcher } from '../fetcher/base.ts';
import { redisCount } from './utility.ts';

export async function getMatchBlob(
  matchId: number,
  fetchers: {
    apiFetcher: MatchFetcher<ApiData>;
    gcFetcher: MatchFetcher<GcData>;
    parsedFetcher: MatchFetcher<ParsedData>;
    archivedFetcher: MatchFetcher<ParsedMatch> | null;
  },
): Promise<[Match | ParsedMatch | null, GetMatchDataMetadata | null]> {
  let { apiFetcher, gcFetcher, parsedFetcher, archivedFetcher } = fetchers;
  let [api, gcdata, parsed, archived]: [
    ApiData | null,
    GcData | null,
    ParsedData | null,
    ParsedMatch | null | undefined,
  ] = await Promise.all([
    apiFetcher.getData(matchId),
    gcFetcher.getData(matchId),
    parsedFetcher.getData(matchId),
    archivedFetcher?.getData(matchId),
  ]);

  let odData: GetMatchDataMetadata = {
    has_api: Boolean(api),
    has_gcdata: Boolean(gcdata),
    has_parsed: Boolean(parsed),
    has_archive: Boolean(archived),
  };

  if (!archived && !api) {
    // Use this event to count the number of failed requests
    // Could be due to missing data or invalid ID--need to analyze
    redisCount('steam_api_backfill');
    return [null, null];
  }

  const basePlayers = api?.players || archived?.players;
  // Merge the results together
  const final: Match | ParsedMatch = {
    ...archived,
    ...parsed,
    ...gcdata,
    ...api,
    players: basePlayers?.map((basePlayer) => {
      const apiPlayer = api?.players.find(
        (apiP) => apiP.player_slot === basePlayer.player_slot,
      );
      const archivedPlayer = archived?.players.find(
        (archivedP) => archivedP.player_slot === basePlayer.player_slot,
      );
      const gcPlayer = gcdata?.players.find(
        (gcp) => gcp.player_slot === basePlayer.player_slot,
      );
      const parsedPlayer = parsed?.players.find(
        (pp) => pp.player_slot === basePlayer.player_slot,
      );
      return {
        ...archivedPlayer,
        ...parsedPlayer,
        ...gcPlayer,
        ...apiPlayer,
      };
    }) as ParsedPlayer[],
  } as ParsedMatch;
  return [final, odData];
}
