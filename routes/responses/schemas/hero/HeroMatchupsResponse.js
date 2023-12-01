const commonProperties = require('../../properties/commonProperties');

module.exports = {
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
