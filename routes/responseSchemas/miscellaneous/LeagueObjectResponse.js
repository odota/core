const commonProperties = require("../../properties/commonProperties");

module.exports = {
  LeagueObjectResponse: {
    title: "LeagueObjectResponse",
    type: "object",
    properties: {
      leagueid: {
        description: "leagueid",
        type: "integer",
      },
      ticket: {
        description: "ticket",
        type: "string",
      },
      banner: {
        description: "banner",
        type: "string",
      },
      tier: {
        description: "tier",
        type: "string",
      },
      name: commonProperties.league_name,
    },
  },
};
