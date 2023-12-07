const commonProperties = require('../../properties/commonProperties');

module.exports = {
  PlayerObjectResponse: {
    title: 'PlayerObjectResponse',
    type: 'object',
    properties: {
      account_id: commonProperties.account_id,
      steamid: {
        description: "Player's steam identifier",
        type: 'string',
      },
      avatar: {
        description: 'Steam picture URL (small picture)',
        type: 'string',
      },
      avatarmedium: {
        description: 'Steam picture URL (medium picture)',
        type: 'string',
      },
      avatarfull: {
        description: 'Steam picture URL (full picture)',
        type: 'string',
      },
      profileurl: {
        description: 'Steam profile URL',
        type: 'string',
      },
      personaname: commonProperties.persona_name,
      last_login: {
        description: 'Date and time of last login to OpenDota',
        type: 'string',
        format: 'date-time',
      },
      full_history_time: {
        description:
          "Date and time of last request to refresh player's match history",
        type: 'string',
        format: 'date-time',
      },
      cheese: {
        description: 'Amount of dollars the player has donated to OpenDota',
        type: 'integer',
      },
      fh_unavailable: {
        description: "Whether the refresh of player' match history failed",
        type: 'boolean',
      },
      loccountrycode: {
        description: "Player's country identifier, e.g. US",
        type: 'string',
      },
      name: {
        description: "Verified player name, e.g. 'Miracle-'",
        type: 'string',
      },
      country_code: {
        description: "Player's country code",
        type: 'string',
      },
      fantasy_role: {
        description: "Player's ingame role (core: 1 or support: 2)",
        type: 'integer',
      },
      team_id: {
        description: "Player's team identifier",
        type: 'integer',
      },
      team_name: commonProperties.team_name,
      team_tag: {
        description: "Player's team shorthand tag, e.g. 'EG'",
        type: 'string',
      },
      is_locked: {
        description: 'Whether the roster lock is active',
        type: 'boolean',
      },
      is_pro: {
        description: 'Whether the player is professional or not',
        type: 'boolean',
      },
      locked_until: {
        description: 'When the roster lock will end',
        type: 'integer',
      },
    },
  },
};
