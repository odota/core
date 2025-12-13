import commonProperties from "./properties/commonProperties.ts";

export default {
  PublicMatchesResponse: {
    title: "PublicMatchesResponse",
    type: "object",
    properties: {
      match_id: commonProperties.match_id,
      match_seq_num: {
        description: "match_seq_num",
        type: "integer",
      },
      radiant_win: commonProperties.radiant_win,
      start_time: commonProperties.start_time,
      duration: commonProperties.duration,
      lobby_type: {
        type: "integer",
      },
      game_mode: {
        type: "integer",
      },
      avg_rank_tier: {
        type: "integer",
      },
      num_rank_tier: {
        type: "integer",
      },
      cluster: {
        type: "integer",
      },
      radiant_team: {
        description: "radiant_team",
        type: "array",
        items: {
          type: "integer",
        },
      },
      dire_team: {
        description: "dire_team",
        type: "array",
        items: {
          type: "integer",
        },
      },
    },
  },
};
