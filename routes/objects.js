const teamObject = {
  type: 'object',
  properties: {
    team_id: {
      description: 'Team\'s identifier',
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
      description: 'Team name, eg. \'Newbee\'',
      type: 'string',
    },
    tag: {
      description: 'The team tag/abreviation',
      type: 'string',
    },
  },
};
const matchObject = {
  type: 'object',
  properties: {
    match_id: {
      description: 'Used to idenfiy individual matches, eg. 3703866531',
      type: 'integer',
    },
    duration: {
      description: 'Length of the match',
      type: 'integer',
    },
    start_time: {
      description: 'Unix timestamp of when the match began',
      type: 'integer',
    },
    radiant_team_id: {
      description: 'The Radiant\'s team_id',
      type: 'integer',
    },
    radiant_name: {
      description: 'The Radiant\'s team name',
      type: 'string',
    },
    dire_team_id: {
      description: 'The Dire\'s team_id',
      type: 'integer',
    },
    dire_name: {
      description: 'The Dire\'s team name',
      type: 'string',
    },
    leagueid: {
      description: 'Identifier for the league the match took place in',
      type: 'integer',
    },
    league_name: {
      description: 'Name of league the match took place in',
      type: 'string',
    },
    series_id: {
      description: 'Identifier for the series of the match',
      type: 'integer',
    },
    series_type: {
      description: 'Type of series the match was',
      type: 'integer',
    },
    radiant_score: {
      description: 'Number of kills the radiant team had when the match ended',
      type: 'integer',
    },
    dire_score: {
      description: 'Number of kills the dire team had when the match ended',
      type: 'integer',
    },
    radiant_win: {
      description: 'Whether or not the radiant won the match',
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
      description: 'Numeric identifier for the hero object',
      type: 'integer',
    },
    name: {
      description: 'Dota hero command name, eg. \'npm_dota_hero_antimage\'',
      type: 'string',
    },
    localized_name: {
      description: 'Hero name, eg. \'Anti-Mage\'',
      type: 'string',
    },
    primary_attr: {
      description: 'Hero primary shorthand attribute name, eg. \'agi\'',
      type: 'string',
    },
    attack_type: {
      description: 'Hero attack type, either \'Melee\' or \'Ranged\'',
      type: 'string',
    },
    roles: {
      type: 'array',
      items: {
        description: 'A hero\'s role in the game',
        type: 'string',
      },
    },
  },
};
const playerObject = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      account_id: {
        description: 'Player\'s account identifier',
        type: 'integer',
      },
      steamid: {
        description: 'Player\'s steam identifier',
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
      personaname: {
        description: 'Player\'s Steam name',
        type: 'string',
      },
      last_login: {
        description: 'Date and time of last login to OpenDota',
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
        description: 'Player\'s country identifier, eg. US',
        type: 'string',
      },
      name: {
        description: 'Varified player name, eg. \'Miracle-\'',
        type: 'string',
      },
      country_code: {
        description: 'Player\'s country code',
        type: 'string',
      },
      fantasy_role: {
        description: 'fantasy_role',
        type: 'integer',
      },
      team_id: {
        description: 'Player\'s team identifier',
        type: 'integer',
      },
      team_name: {
        description: 'Player\'s team name, eg. \'Evil Geniuses\'',
        type: 'string',
      },
      team_tag: {
        description: 'Player\'s team shorthand tag, eg. \'EG\'',
        type: 'string',
      },
      is_locked: {
        description: 'is_locked',
        type: 'boolean',
      },
      is_pro: {
        description: 'Boolean for if player is professional',
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
