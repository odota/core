import commonProperties from "./properties/commonProperties.ts";

export default {
  TeamObjectResponse: {
    title: "TeamObjectResponse",
    type: "object",
    properties: {
      team_id: {
        description: "Team's identifier",
        type: "integer",
      },
      rating: {
        description: "The Elo rating of the team",
        type: "number",
      },
      wins: {
        description: "The number of games won by this team",
        type: "integer",
      },
      losses: {
        description: "The number of losses by this team",
        type: "integer",
      },
      last_match_time: {
        description: "The Unix timestamp of the last match played by this team",
        type: "integer",
      },
      name: commonProperties.team_name,
      tag: {
        description: "The team tag/abbreviation",
        type: "string",
      },
    },
  },
};
