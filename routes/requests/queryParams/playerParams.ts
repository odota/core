export default {
  accountIdParam: {
    name: 'account_id',
    in: 'path',
    description: 'Steam32 account ID',
    required: true,
    schema: {
      type: 'integer',
    },
  },
  // for /players/{account_id}/histograms/{field}:
  fieldParam: {
    name: 'field',
    in: 'path',
    description: 'Field to aggregate on',
    required: true,
    schema: {
      type: 'string',
    },
  },
  // for /players/{account_id}/matches
  projectParam: {
    name: 'project',
    in: 'query',
    description: 'Fields to project (array)',
    required: false,
    schema: {
      type: 'string',
    },
  },
  // playerParamNames:
  limitParam: {
    name: 'limit',
    in: 'query',
    description: 'Number of matches to limit to',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  offsetParam: {
    name: 'offset',
    in: 'query',
    description: 'Number of matches to offset start by',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  winParam: {
    name: 'win',
    in: 'query',
    description: 'Whether the player won',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  patchParam: {
    name: 'patch',
    in: 'query',
    description: 'Patch ID, from dotaconstants',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  gameModeParam: {
    name: 'game_mode',
    in: 'query',
    description: 'Game Mode ID',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  lobbyTypeParam: {
    name: 'lobby_type',
    in: 'query',
    description: 'Lobby type ID',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  regionParam: {
    name: 'region',
    in: 'query',
    description: 'Region ID',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  dateParam: {
    name: 'date',
    in: 'query',
    description: 'Days previous',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  laneRoleParam: {
    name: 'lane_role',
    in: 'query',
    description: 'Lane Role ID',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  heroIdParam: {
    name: 'hero_id',
    in: 'query',
    description: 'Hero ID',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  isRadiantParam: {
    name: 'is_radiant',
    in: 'query',
    description: 'Whether the player was radiant',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  includedAccountIdParam: {
    name: 'included_account_id',
    in: 'query',
    description: 'Account IDs in the match (array)',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  excludedAccountIdParam: {
    name: 'excluded_account_id',
    in: 'query',
    description: 'Account IDs not in the match (array)',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  withHeroIdParam: {
    name: 'with_hero_id',
    in: 'query',
    description: "Hero IDs on the player's team (array)",
    required: false,
    schema: {
      type: 'integer',
    },
  },
  againstHeroIdParam: {
    name: 'against_hero_id',
    in: 'query',
    description: "Hero IDs against the player's team (array)",
    required: false,
    schema: {
      type: 'integer',
    },
  },
  significantParam: {
    name: 'significant',
    in: 'query',
    description:
      'Whether the match was significant for aggregation purposes. Defaults to 1 (true), set this to 0 to return data for non-standard modes/matches.',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  havingParam: {
    name: 'having',
    in: 'query',
    description: 'The minimum number of games played, for filtering hero stats',
    required: false,
    schema: {
      type: 'integer',
    },
  },
  sortParam: {
    name: 'sort',
    in: 'query',
    description: 'The field to return matches sorted by in descending order',
    required: false,
    schema: {
      type: 'string',
    },
  },
};
