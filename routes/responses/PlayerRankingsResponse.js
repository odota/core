import { hero_id as _hero_id } from '../../properties/commonProperties';

export const PlayerRankingsResponse = {
  title: 'PlayerRankingsResponse',
  type: 'object',
  properties: {
    hero_id: _hero_id,
    score: {
      description: 'Hero score',
      type: 'number',
    },
    percent_rank: {
      description: 'percent_rank',
      type: 'number',
    },
    card: {
      description: 'numeric_rank',
      type: 'integer',
    },
  },
};
