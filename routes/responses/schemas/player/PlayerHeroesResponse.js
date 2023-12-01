const commonProperties = require('../../properties/commonProperties');

module.exports = {
  PlayerHeroesResponse: {
    title: 'PlayerHeroesResponse',
    description: 'hero',
    type: 'object',
    properties: {
      hero_id: commonProperties.hero_id,
      last_played: {
        description: 'last_played',
        type: 'integer',
      },
      games: {
        description: 'games',
        type: 'integer',
      },
      win: {
        description: 'win',
        type: 'integer',
      },
      with_games: {
        description: 'with_games',
        type: 'integer',
      },
      with_win: {
        description: 'with_win',
        type: 'integer',
      },
      against_games: {
        description: 'against_games',
        type: 'integer',
      },
      against_win: {
        description: 'against_win',
        type: 'integer',
      },
    },
  },
};
