import commonProperties from './properties/commonProperties';

export default {
  PlayerProsResponse: {
    title: 'PlayerProsResponse',
    type: 'object',
    properties: {
      account_id: commonProperties.account_id,
      name: commonProperties.general_name,
      country_code: {
        description: 'country_code',
        type: 'string',
      },
      fantasy_role: {
        description: 'fantasy_role',
        type: 'integer',
      },
      team_id: {
        description: 'team_id',
        type: 'integer',
      },
      team_name: commonProperties.team_name,
      team_tag: {
        description: 'team_tag',
        type: 'string',
        nullable: true,
      },
      is_locked: {
        description: 'is_locked',
        type: 'boolean',
      },
      is_pro: {
        description: 'is_pro',
        type: 'boolean',
      },
      locked_until: {
        description: 'locked_until',
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
        format: 'date-time',
        nullable: true,
      },
      full_history_time: {
        description: 'full_history_time',
        type: 'string',
        format: 'date-time',
        nullable: true,
      },
      cheese: {
        description: 'cheese',
        type: 'integer',
        nullable: true,
      },
      fh_unavailable: {
        description: 'fh_unavailable',
        type: 'boolean',
        nullable: true,
      },
      loccountrycode: {
        description: 'loccountrycode',
        type: 'string',
        nullable: true,
      },
      last_played: {
        description: 'last_played',
        type: 'integer',
        nullable: true,
      },
      win: {
        description: 'win',
        type: 'integer',
      },
      games: {
        description: 'games',
        type: 'integer',
      },
      with_win: {
        description: 'with_win',
        type: 'integer',
      },
      with_games: {
        description: 'with_games',
        type: 'integer',
      },
      against_win: {
        description: 'against_win',
        type: 'integer',
      },
      against_games: {
        description: 'against_games',
        type: 'integer',
      },
      with_gpm_sum: {
        description: 'with_gpm_sum',
        type: 'integer',
        nullable: true,
      },
      with_xpm_sum: {
        description: 'with_xpm_sum',
        type: 'integer',
        nullable: true,
      },
    },
  },
};
