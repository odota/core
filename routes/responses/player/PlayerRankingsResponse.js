const commonProperties = require("../../commonProperties");

module.exports = {
  PlayerRankingsResponse: {
    title: "PlayerRankingsResponse",
    type: "object",
    properties: {
      hero_id: commonProperties.hero_id,
      score: {
        description: "Hero score",
        type: "number",
      },
      percent_rank: {
        description: "percent_rank",
        type: "number",
      },
      card: {
        description: "numeric_rank",
        type: "integer",
      },
    },
  },
};
