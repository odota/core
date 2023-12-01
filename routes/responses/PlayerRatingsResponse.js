import { account_id as _account_id, match_id as _match_id } from '../../properties/commonProperties';

export const PlayerRatingsResponse = {
  title: 'PlayerRatingsResponse',
  type: 'object',
  properties: {
    account_id: _account_id,
    match_id: _match_id,
    solo_competitive_rank: {
      description: 'solo_competitive_rank',
      type: 'integer',
      nullable: true,
    },
    competitive_rank: {
      description: 'competitive_rank',
      type: 'integer',
    },
    time: {
      description: 'time',
      type: 'integer',
    },
  },
};
