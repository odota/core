import { hero_id as _hero_id } from '../../properties/commonProperties';

export const HeroMatchupsResponse = {
  title: 'HeroMatchupsResponse',
  type: 'object',
  properties: {
    hero_id: _hero_id,
    games_played: {
      description: 'Number of games played',
      type: 'integer',
    },
    wins: {
      description: 'Number of games won',
      type: 'integer',
    },
  },
};
