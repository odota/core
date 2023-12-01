const commonProperties = require('../../properties/commonProperties');

module.exports = {
  ScenarioItemTimingsResponse: {
    title: 'ScenarioItemTimingsResponse',
    type: 'object',
    properties: {
      hero_id: commonProperties.hero_id,
      item: {
        description: 'Purchased item',
        type: 'string',
      },
      time: {
        description: 'Ingame time in seconds before the item was purchased',
        type: 'integer',
      },
      games: {
        description:
          'The number of games where the hero bought this item before this time',
        type: 'string',
      },
      wins: {
        description:
          'The number of games won where the hero bought this item before this time',
        type: 'string',
      },
    },
  },
};
