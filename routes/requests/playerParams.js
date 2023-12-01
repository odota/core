export const accountIdParam = {
    name: 'account_id',
    in: 'path',
    description: 'Steam32 account ID',
    required: true,
    schema: {
        type: 'integer',
    },
};
export const fieldParam = {
    name: 'field',
    in: 'path',
    description: 'Field to aggregate on',
    required: true,
    schema: {
        type: 'string',
    },
};
export const projectParam = {
    name: 'project',
    in: 'query',
    description: 'Fields to project (array)',
    required: false,
    schema: {
        type: 'string',
    },
};
export const limitParam = {
    name: 'limit',
    in: 'query',
    description: 'Number of matches to limit to',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const offsetParam = {
    name: 'offset',
    in: 'query',
    description: 'Number of matches to offset start by',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const winParam = {
    name: 'win',
    in: 'query',
    description: 'Whether the player won',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const patchParam = {
    name: 'patch',
    in: 'query',
    description: 'Patch ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const gameModeParam = {
    name: 'game_mode',
    in: 'query',
    description: 'Game Mode ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const lobbyTypeParam = {
    name: 'lobby_type',
    in: 'query',
    description: 'Lobby type ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const regionParam = {
    name: 'region',
    in: 'query',
    description: 'Region ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const dateParam = {
    name: 'date',
    in: 'query',
    description: 'Days previous',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const laneRoleParam = {
    name: 'lane_role',
    in: 'query',
    description: 'Lane Role ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const heroIdParam = {
    name: 'hero_id',
    in: 'query',
    description: 'Hero ID',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const isRadiantParam = {
    name: 'is_radiant',
    in: 'query',
    description: 'Whether the player was radiant',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const includedAccountIdParam = {
    name: 'included_account_id',
    in: 'query',
    description: 'Account IDs in the match (array)',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const excludedAccountIdParam = {
    name: 'excluded_account_id',
    in: 'query',
    description: 'Account IDs not in the match (array)',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const withHeroIdParam = {
    name: 'with_hero_id',
    in: 'query',
    description: "Hero IDs on the player's team (array)",
    required: false,
    schema: {
        type: 'integer',
    },
};
export const againstHeroIdParam = {
    name: 'against_hero_id',
    in: 'query',
    description: "Hero IDs against the player's team (array)",
    required: false,
    schema: {
        type: 'integer',
    },
};
export const significantParam = {
    name: 'significant',
    in: 'query',
    description: 'Whether the match was significant for aggregation purposes. Defaults to 1 (true), set this to 0 to return data for non-standard modes/matches.',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const havingParam = {
    name: 'having',
    in: 'query',
    description: 'The minimum number of games played, for filtering hero stats',
    required: false,
    schema: {
        type: 'integer',
    },
};
export const sortParam = {
    name: 'sort',
    in: 'query',
    description: 'The field to return matches sorted by in descending order',
    required: false,
    schema: {
        type: 'string',
    },
};
