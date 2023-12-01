import { match_id as _match_id, radiant_win as _radiant_win, start_time as _start_time, duration as _duration } from '../../properties/commonProperties';

export const PublicMatchesResponse = {
  title: 'PublicMatchesResponse',
  type: 'object',
  properties: {
    match_id: _match_id,
    match_seq_num: {
      description: 'match_seq_num',
      type: 'integer',
    },
    radiant_win: _radiant_win,
    start_time: _start_time,
    duration: _duration,
    avg_mmr: {
      type: 'integer',
    },
    num_mmr: {
      type: 'integer',
    },
    lobby_type: {
      type: 'integer',
    },
    game_mode: {
      type: 'integer',
    },
    avg_rank_tier: {
      type: 'integer',
    },
    num_rank_tier: {
      type: 'integer',
    },
    cluster: {
      type: 'integer',
    },
    radiant_team: {
      description: 'radiant_team',
      type: 'string',
    },
    dire_team: {
      description: 'dire_team',
      type: 'string',
    },
  },
};
