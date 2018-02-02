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
      description: 'The team tag/abbreviation',
      type: 'string',
    },
  },
};
const matchObject = {
  type: 'object',
  properties: {
    match_id: {
      description: 'Used to identify individual matches, e.g. 3703866531',
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
      description: 'Number of kills the Radiant team had when the match ended',
      type: 'integer',
    },
    dire_score: {
      description: 'Number of kills the Dire team had when the match ended',
      type: 'integer',
    },
    radiant_win: {
      description: 'Whether or not the Radiant won the match',
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
      description: 'Dota hero command name, e.g. \'npc_dota_hero_antimage\'',
      type: 'string',
    },
    localized_name: {
      description: 'Hero name, e.g. \'Anti-Mage\'',
      type: 'string',
    },
    primary_attr: {
      description: 'Hero primary shorthand attribute name, e.g. \'agi\'',
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
        description: 'Date and time of last request to refresh player\'s match history',
        type: 'dateTime',
      },
      cheese: {
        description: 'Amount of dollars the player has donated to OpenDota',
        type: 'integer',
      },
      fh_unavailable: {
        description: 'Whether the refresh of player\' match history failed',
        type: 'boolean',
      },
      loccountrycode: {
        description: 'Player\'s country identifier, e.g. US',
        type: 'string',
      },
      name: {
        description: 'Verified player name, e.g. \'Miracle-\'',
        type: 'string',
      },
      country_code: {
        description: 'Player\'s country code',
        type: 'string',
      },
      fantasy_role: {
        description: 'Player\'s ingame role (core: 1 or support: 2)',
        type: 'integer',
      },
      team_id: {
        description: 'Player\'s team identifier',
        type: 'integer',
      },
      team_name: {
        description: 'Player\'s team name, e.g. \'Evil Geniuses\'',
        type: 'string',
      },
      team_tag: {
        description: 'Player\'s team shorthand tag, e.g. \'EG\'',
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

module.exports = {
  matchObject, teamObject, heroObject, playerObject,
};
