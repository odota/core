const commonProperties = require('../../properties/commonProperties');

module.exports = {
  PlayersResponse: {
    title: 'PlayerResponse',
    type: 'object',
    properties: {
      solo_competitive_rank: {
        description: 'solo_competitive_rank',
        type: 'integer',
        nullable: true,
      },
      competitive_rank: {
        description: 'competitive_rank',
        type: 'integer',
        nullable: true,
      },
      rank_tier: {
        description: 'rank_tier',
        type: 'number',
        nullable: true,
      },
      leaderboard_rank: {
        description: 'leaderboard_rank',
        type: 'number',
        nullable: true,
      },
      mmr_estimate: {
        description: 'mmr_estimate',
        type: 'object',
        properties: {
          estimate: {
            description: 'estimate',
            type: 'number',
            nullable: true,
          },
        },
      },
      profile: {
        description: 'profile',
        type: 'object',
        properties: {
          account_id: commonProperties.account_id,
          personaname: commonProperties.persona_name,
          name: commonProperties.general_name,
          plus: {
            description:
              'Boolean indicating status of current Dota Plus subscription',
            type: 'boolean',
          },
          cheese: {
            description: 'cheese',
            type: 'integer',
            nullable: true,
          },
          steamid: {
            description: 'steamid',
            type: 'string',
            nullable: true,
          },
          avatar: {
            description: 'avatar',
            type: 'string',
            nullable: true,
          },
          avatarmedium: {
            description: 'avatarmedium',
            type: 'string',
            nullable: true,
          },
          avatarfull: {
            description: 'avatarfull',
            type: 'string',
            nullable: true,
          },
          profileurl: {
            description: 'profileurl',
            type: 'string',
            nullable: true,
          },
          last_login: {
            description: 'last_login',
            type: 'string',
            nullable: true,
          },
          loccountrycode: {
            description: 'loccountrycode',
            type: 'string',
            nullable: true,
          },
          is_contributor: {
            description:
              'Boolean indicating if the user contributed to the development of OpenDota',
            type: 'boolean',
            default: false,
          },
          is_subscriber: {
            description:
              'Boolean indicating if the user subscribed to OpenDota',
            type: 'boolean',
            default: false,
          },
        },
      },
    },
  },
};
