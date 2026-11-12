import commonProperties from "./properties/commonProperties.ts";

export default {
  HeroMatchupsResponse: {
    title: "HeroMatchupsResponse",
    type: "object",
    properties: {
      hero_id: commonProperties.hero_id,
      games_played: {
        description: "Number of games played",
        type: "integer",
      },
      wins: {
        description: "Number of games won",
        type: "integer",
      },
      advantage: {
        description:
          "Lower bound of the Wilson score interval for the win rate, as a percentage. What the hero matchups page sorts by",
        type: "integer",
      },
    },
  },
};
