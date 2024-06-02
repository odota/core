import { filterDeps } from '../util/filter';

/**
 * List of columns to support for histograms and totals
 */
export const histogramCols = [
  'kills',
  'deaths',
  'assists',
  'kda',
  'gold_per_min',
  'xp_per_min',
  'last_hits',
  'denies',
  'lane_efficiency_pct',
  'duration',
  'level',
  'hero_damage',
  'tower_damage',
  'hero_healing',
  'stuns',
  'tower_kills',
  'neutral_kills',
  'courier_kills',
  'purchase_tpscroll',
  'purchase_ward_observer',
  'purchase_ward_sentry',
  'purchase_gem',
  'purchase_rapier',
  'pings',
  'throw',
  'comeback',
  'stomp',
  'loss',
  'actions_per_min',
] as const;

// Columns always projected
export const alwaysCols = ['match_id', 'player_slot', 'radiant_win'] as const;

// Columns returned in matches call by default
export const matchesCols = [
  'hero_id',
  'start_time',
  'duration',
  'game_mode',
  'lobby_type',
  'version',
  'kills',
  'deaths',
  'assists',
  'average_rank',
  'leaver_status',
  'party_size',
  'hero_variant',
] as const;

// Used in the UI to show items on match list
export const itemsCols = [
  'item_0',
  'item_1',
  'item_2',
  'item_3',
  'item_4',
  'item_5',
] as const;

// Static list of columns to return for recent matches
// Includes alwaysCols because it doesn't use the same queryObj as the other calls
export const recentMatchesCols = [
  'match_id',
  'player_slot',
  'radiant_win',
  'hero_id',
  'start_time',
  'duration',
  'game_mode',
  'lobby_type',
  'version',
  'kills',
  'deaths',
  'assists',
  'average_rank',
  'xp_per_min',
  'gold_per_min',
  'hero_damage',
  'tower_damage',
  'hero_healing',
  'last_hits',
  'lane',
  'lane_role',
  'is_roaming',
  'cluster',
  'leaver_status',
  'party_size',
  'hero_variant',
] as (keyof ParsedPlayerMatch)[];

export const heroesCols = ['heroes', 'account_id', 'start_time'] as const;
export const significantCols = filterDeps.significant;
export const peersCols = [
  'heroes',
  'start_time',
  'gold_per_min',
  'xp_per_min',
] as const;
export const prosCols = ['heroes', 'start_time'] as const;
export const wardmapCols = ['obs', 'sen'] as const;
export const wordcloudCols = ['all_word_counts', 'my_word_counts'] as const;

// NOTE: These are filterDeps keys, not column names directly
export const countsCats = [
  'leaver_status',
  'game_mode',
  'lobby_type',
  'lane_role',
  'region',
  'patch',
  'is_radiant',
] as const;
export const countsCols = countsCats.map((name) => filterDeps[name]).flat();

// Cache a set of columns for the frontpage and matches queries
export const cacheableCols = new Set([
  ...alwaysCols,
  ...significantCols,
  ...peersCols,
  ...heroesCols,
  ...countsCols,
  ...matchesCols,
  ...itemsCols,
]);
