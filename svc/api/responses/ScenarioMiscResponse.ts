export default {
  ScenarioMiscResponse: {
    title: "ScenarioMiscResponse",
    type: "object",
    properties: {
      scenario: {
        description: "The scenario's name or description",
        type: "string",
      },
      is_radiant: {
        description:
          "Boolean indicating whether Radiant executed this scenario",
        type: "boolean",
      },
      region: {
        description: "Region the game was played in",
        type: "integer",
      },
      games: {
        description: "The number of games where this scenario occurred",
        type: "string",
      },
      wins: {
        description: "The number of games won where this scenario occured",
        type: "string",
      },
    },
  },
};
