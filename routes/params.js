const su = require("../util/scenariosUtil");

module.exports = {
  matchIdParam: {
    name: "match_id",
    in: "path",
    required: true,
    schema: {
      type: "integer",
    },
  },
  accountIdParam: {
    name: "account_id",
    in: "path",
    description: "Steam32 account ID",
    required: true,
    schema: {
      type: "integer",
    },
  },
  teamIdPathParam: {
    name: "team_id",
    in: "path",
    description: "Team ID",
    required: true,
    schema: {
      type: "integer",
    },
  },
  leagueIdPathParam: {
    name: "league_id",
    in: "path",
    description: "League ID",
    required: true,
    schema: {
      type: "integer",
    },
  },
  heroIdPathParam: {
    name: "hero_id",
    in: "path",
    description: "Hero ID",
    required: true,
    schema: {
      type: "integer",
    },
  },
  fieldParam: {
    name: "field",
    in: "path",
    description: "Field to aggregate on",
    required: true,
    schema: {
      type: "string",
    },
  },
  limitParam: {
    name: "limit",
    in: "query",
    description: "Number of matches to limit to",
    required: false,
    schema: {
      type: "integer",
    },
  },
  offsetParam: {
    name: "offset",
    in: "query",
    description: "Number of matches to offset start by",
    required: false,
    schema: {
      type: "integer",
    },
  },
  projectParam: {
    name: "project",
    in: "query",
    description: "Fields to project (array)",
    required: false,
    schema: {
      type: "string",
    },
  },
  winParam: {
    name: "win",
    in: "query",
    description: "Whether the player won",
    required: false,
    schema: {
      type: "integer",
    },
  },
  patchParam: {
    name: "patch",
    in: "query",
    description: "Patch ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  gameModeParam: {
    name: "game_mode",
    in: "query",
    description: "Game Mode ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  lobbyTypeParam: {
    name: "lobby_type",
    in: "query",
    description: "Lobby type ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  regionParam: {
    name: "region",
    in: "query",
    description: "Region ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  dateParam: {
    name: "date",
    in: "query",
    description: "Days previous",
    required: false,
    schema: {
      type: "integer",
    },
  },
  laneRoleParam: {
    name: "lane_role",
    in: "query",
    description: "Lane Role ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  heroIdParam: {
    name: "hero_id",
    in: "query",
    description: "Hero ID",
    required: false,
    schema: {
      type: "integer",
    },
  },
  isRadiantParam: {
    name: "is_radiant",
    in: "query",
    description: "Whether the player was radiant",
    required: false,
    schema: {
      type: "integer",
    },
  },
  withHeroIdParam: {
    name: "with_hero_id",
    in: "query",
    description: "Hero IDs on the player's team (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  againstHeroIdParam: {
    name: "against_hero_id",
    in: "query",
    description: "Hero IDs against the player's team (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  withAccountIdParam: {
    name: "with_account_id",
    in: "query",
    description: "Account IDs on the player's team (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  againstAccountIdParam: {
    name: "against_account_id",
    in: "query",
    description: "Account IDs against the player's team (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  includedAccountIdParam: {
    name: "included_account_id",
    in: "query",
    description: "Account IDs in the match (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  excludedAccountIdParam: {
    name: "excluded_account_id",
    in: "query",
    description: "Account IDs not in the match (array)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  significantParam: {
    name: "significant",
    in: "query",
    description:
      "Whether the match was significant for aggregation purposes. Defaults to 1 (true), set this to 0 to return data for non-standard modes/matches.",
    required: false,
    schema: {
      type: "integer",
    },
  },
  sortParam: {
    name: "sort",
    in: "query",
    description: "The field to return matches sorted by in descending order",
    required: false,
    schema: {
      type: "string",
    },
  },
  havingParam: {
    name: "having",
    in: "query",
    description: "The minimum number of games played, for filtering hero stats",
    required: false,
    schema: {
      type: "integer",
    },
  },
  minMmrParam: {
    name: "min_mmr",
    in: "query",
    description: "Minimum average MMR",
    required: false,
    schema: {
      type: "integer",
    },
  },
  maxMmrParam: {
    name: "max_mmr",
    in: "query",
    description: "Maximum average MMR",
    required: false,
    schema: {
      type: "integer",
    },
  },
  minTimeParam: {
    name: "min_time",
    in: "query",
    description: "Minimum start time (Unix time)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  maxTimeParam: {
    name: "max_time",
    in: "query",
    description: "Maximum start time (Unix time)",
    required: false,
    schema: {
      type: "integer",
    },
  },
  mmrAscendingParam: {
    name: "mmr_ascending",
    in: "query",
    description: "Order by MMR ascending",
    required: false,
    schema: {
      type: "integer",
    },
  },
  mmrDescendingParam: {
    name: "mmr_descending",
    in: "query",
    description: "Order by MMR descending",
    required: false,
    schema: {
      type: "integer",
    },
  },
  lessThanMatchIdParam: {
    name: "less_than_match_id",
    in: "query",
    description: "Get matches with a match ID lower than this value",
    required: false,
    schema: {
      type: "integer",
    },
  },
  matchOverviewParam: {
    name: "overview",
    in: "query",
    description: "Only fetch data required for match overview page",
    required: false,
    schema: {
      type: "integer",
    },
  },
  scenarioParam: {
    name: "scenario",
    in: "query",
    description: su.teamScenariosQueryParams.toString(),
    required: false,
    schema: {
      schema: {
        type: "string",
      },
    },
  },
};
