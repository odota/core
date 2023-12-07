const commonProperties = require('../../properties/commonProperties');

module.exports = {
  PlayerRatingsResponse: {
    title: 'PlayerRatingsResponse',
    type: 'object',
    properties: {
      account_id: commonProperties.account_id,
      match_id: commonProperties.match_id,
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
  },
};
