import commonProperties from "./properties/commonProperties.ts";

export default {
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
