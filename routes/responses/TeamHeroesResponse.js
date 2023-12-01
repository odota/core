import { hero_id as _hero_id, hero_name } from '../../properties/commonProperties';

export const TeamHeroesResponse = {
  title: 'TeamHeroesResponse',
  type: 'object',
  properties: {
    hero_id: _hero_id,
    name: hero_name,
    games_played: {
      description: 'Number of games played',
      type: 'integer',
    },
    wins: {
      description: 'Number of wins',
      type: 'integer',
    },
  },
};
