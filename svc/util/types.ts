import type apiMatch from '../../test/data/details_api.json';
import type apiMatchPro from '../../test/data/details_api_pro.json';

export type ApiMatch = (typeof apiMatch)['result'];
export type ApiMatchPro = (typeof apiMatchPro)['result'];
export type ApiPlayer = ApiMatch['players'][number] & {
  ability_upgrades_arr?: number[];
};
export type InsertMatchInput = ApiMatch | ApiMatchPro | ParserMatch | GcMatch;
export type HistoryType = {
  account_id: number;
  match_id: number;
  player_slot: number;
};
