const commonProperties = require("../../properties/responses/commonProperties");

module.exports = {
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
      radiant_team: {
        description: "radiant_team",
        type: "string",
      },
      dire_team: {
        description: "dire_team",
        type: "string",
      },
    },
  },
};
