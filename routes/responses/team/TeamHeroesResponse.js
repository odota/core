const commonProperties = require("../../commonProperties");

module.exports = {
  TeamHeroesResponse: {
    title: "TeamHeroesResponse",
    type: "object",
    properties: {
      hero_id: commonProperties.hero_id,
      name: commonProperties.hero_name,
      games_played: {
        description: "Number of games played",
        type: "integer",
      },
      wins: {
        description: "Number of wins",
        type: "integer",
      },
    },
  },
};
