import commonProperties from "./properties/commonProperties.ts";

export default {
  PlayerRatingsResponse: {
    title: "PlayerRatingsResponse",
    type: "object",
    properties: {
      account_id: commonProperties.account_id,
      match_id: commonProperties.match_id,
      rank_tier: {
        description: "Rank tier/medal of the player",
        type: "integer",
      },
      time: {
        description: "time",
        type: "integer",
      },
    },
  },
};
