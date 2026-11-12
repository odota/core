import commonProperties from "./properties/commonProperties.ts";

export default {
  HeroPlayersResponse: {
    title: "HeroPlayersResponse",
    type: "object",
    properties: {
      account_id: commonProperties.account_id,
      name: {
        description: "Verified player name, e.g. 'Miracle-'",
        type: "string",
        nullable: true,
      },
      team_id: {
        description: "Player's team identifier",
        type: "integer",
        nullable: true,
      },
      team_name: commonProperties.team_name,
      team_tag: {
        description: "Player's team shorthand tag, e.g. 'EG'",
        type: "string",
        nullable: true,
      },
      games_played: {
        description: "Number of games played",
        type: "integer",
      },
      wins: {
        description: "Number of games won",
        type: "integer",
      },
    },
  },
};
