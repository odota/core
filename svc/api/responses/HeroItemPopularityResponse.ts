export default {
  HeroItemPopularityResponse: {
    title: "HeroItemPopularityResponse",
    type: "object",
    properties: {
      start_game_items: {
        description: "Items bought before game started",
        type: "object",
        properties: {
          item: {
            description: "Number of item bought",
            type: "integer",
          },
        },
      },
      early_game_items: {
        description:
          "Items bought in the first 10 min of the game, with cost at least 700",
        type: "object",
        properties: {
          item: {
            description: "Number of item bought",
            type: "integer",
          },
        },
      },
      mid_game_items: {
        description:
          "Items bought between 10 and 25 min of the game, with cost at least 2000",
        type: "object",
        properties: {
          item: {
            description: "Number of item bought",
            type: "integer",
          },
        },
      },
      late_game_items: {
        description:
          "Items bought at least 25 min after game started, with cost at least 4000",
        type: "object",
        properties: {
          item: {
            description: "Number of item bought",
            type: "integer",
          },
        },
      },
    },
  },
};
