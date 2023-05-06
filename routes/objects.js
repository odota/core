const leagueObject = {
  type: "array",
  items: {
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
      name: {
        description: "name",
        type: "string",
      },
    },
  },
};

module.exports = {
  matchObject,
  teamObject,
  heroObject,
  playerObject,
  leagueObject,
};
