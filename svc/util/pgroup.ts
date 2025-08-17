import type { ApiMatch } from './types';

export function getPGroup(match: ApiMatch | Match | ParsedMatch): PGroup {
  // This only works if we are an API insert or reconciling (match/parsedmatch)
  // GcMatch doesn't have hero ID and ParserMatch doesn't have account_id
  // Also, if coming from gcdata we can construct a better pgroup with account IDs
  const result: PGroup = {};
  match.players.forEach((p) => {
    result[p.player_slot] = {
      account_id: p.account_id,
      hero_id: p.hero_id,
    };
  });
  return result;
}
