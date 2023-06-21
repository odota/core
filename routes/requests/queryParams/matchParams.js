module.exports = {
  matchIdParam: {
    name: "match_id",
    in: "path",
    required: true,
    schema: {
      type: "integer",
    },
  },
  // for /publicMatches:
  lessThanMatchIdParam: {
    name: "less_than_match_id",
    in: "query",
    description: "Get matches with a match ID lower than this value",
    required: false,
    schema: {
      type: "integer",
    },
  },
  minRankParam: {
    name: "min_rank",
    in: "query",
    description:
      "Minimum rank for the matches. Ranks are represented by integers (10-15: Herald, 20-25: Guardian, 30-35: Crusader, 40-45: Archon, 50-55: Legend, 60-65: Ancient, 70-75: Divine, 80-85: Immortal). Each increment represents an additional star.",
    required: false,
    schema: {
      type: "integer",
    },
  },
  maxRankParam: {
    name: "max_rank",
    in: "query",
    description:
      "Maximum rank for the matches. Ranks are represented by integers (10-15: Herald, 20-25: Guardian, 30-35: Crusader, 40-45: Archon, 50-55: Legend, 60-65: Ancient, 70-75: Divine, 80-85: Immortal). Each increment represents an additional star.",
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
};
