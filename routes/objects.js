const teamObject = {
  type: 'object',
  properties: {
    team_id: {
      description: 'team_id',
      type: 'integer',
    },
    rating: {
      description: 'The Elo rating of the team',
      type: 'number',
    },
    wins: {
      description: 'The number of games won by this team',
      type: 'integer',
    },
    losses: {
      description: 'The number of losses by this team',
      type: 'integer',
    },
    last_match_time: {
      description: 'The Unix timestamp of the last match played by this team',
      type: 'integer',
    },
    name: {
      description: 'name',
      type: 'string',
    },
    tag: {
      description: 'The team tag',
      type: 'string',
    },
  },
};
const matchObject = {
  type: 'object',
  properties: {
    match_id: {
      description: 'match_id',
      type: 'integer',
    },
    duration: {
      description: 'duration',
      type: 'integer',
    },
    start_time: {
      description: 'start_time',
      type: 'integer',
    },
    radiant_team_id: {
      description: 'radiant_team_id',
      type: 'integer',
    },
    radiant_name: {
      description: 'radiant_name',
      type: 'string',
    },
    dire_team_id: {
      description: 'dire_team_id',
      type: 'integer',
    },
    dire_name: {
      description: 'dire_name',
      type: 'string',
    },
    leagueid: {
      description: 'leagueid',
      type: 'integer',
    },
    league_name: {
      description: 'league_name',
      type: 'string',
    },
    series_id: {
      description: 'series_id',
      type: 'integer',
    },
    series_type: {
      description: 'series_type',
      type: 'integer',
    },
    radiant_score: {
      description: 'radiant_score',
      type: 'integer',
    },
    dire_score: {
      description: 'dire_score',
      type: 'integer',
    },
    radiant_win: {
      description: 'radiant_win',
      type: 'boolean',
    },
    radiant: {
      description: 'Whether the team/player/hero was on Radiant',
      type: 'boolean',
    },
  },
};
const heroObject = {
  type: 'object',
  properties: {
    id: {
      description: 'id',
      type: 'integer',
    },
    name: {
      description: 'name',
      type: 'string',
    },
    localized_name: {
      description: 'localized_name',
      type: 'string',
    },
  },
};
const playerObject = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      account_id: {
        description: 'account_id',
        type: 'integer',
      },
      steamid: {
        description: 'steamid',
        type: 'string',
      },
      avatar: {
        description: 'avatar',
        type: 'string',
      },
      avatarmedium: {
        description: 'avatarmedium',
        type: 'string',
      },
      avatarfull: {
        description: 'avatarfull',
        type: 'string',
      },
      profileurl: {
        description: 'profileurl',
        type: 'string',
      },
      personaname: {
        description: 'personaname',
        type: 'string',
      },
      last_login: {
        description: 'last_login',
        type: 'dateTime',
      },
      full_history_time: {
        description: 'full_history_time',
        type: 'dateTime',
      },
      cheese: {
        description: 'cheese',
        type: 'integer',
      },
      fh_unavailable: {
        description: 'fh_unavailable',
        type: 'boolean',
      },
      loccountrycode: {
        description: 'loccountrycode',
        type: 'string',
      },
      name: {
        description: 'name',
        type: 'string',
      },
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
      team_name: {
        description: 'team_name',
        type: 'string',
      },
      team_tag: {
        description: 'team_tag',
        type: 'string',
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
      },
    },
  },
};

module.exports = {
  matchObject, teamObject, heroObject, playerObject,
};
