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
