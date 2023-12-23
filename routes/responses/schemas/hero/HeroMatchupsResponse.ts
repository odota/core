import commonProperties from '../../properties/commonProperties';

export default {
  HeroMatchupsResponse: {
    title: 'HeroMatchupsResponse',
    type: 'object',
    properties: {
      hero_id: commonProperties.hero_id,
      games_played: {
        description: 'Number of games played',
        type: 'integer',
      },
      wins: {
        description: 'Number of games won',
        type: 'integer',
      },
    },
  },
};
