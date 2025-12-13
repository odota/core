import commonProperties from "./properties/commonProperties.ts";

export default {
  PlayersResponse: {
    title: "PlayerResponse",
    type: "object",
    properties: {
      rank_tier: {
        description: `The player's Dota medal/rank`,
        type: "number",
        nullable: true,
      },
      leaderboard_rank: {
        description: `The player's rank on the Dota leaderboard (if Immortal)`,
        type: "number",
        nullable: true,
      },
      computed_mmr: {
        description: "Rating estimate based on ranked matches",
        type: "number",
        nullable: true,
      },
      computed_mmr_turbo: {
        description: "Rating estimate based on turbo matches",
        type: "integer",
        nullable: true,
      },
      aliases: {
        description: "List of names the player has used on Steam",
        type: "array",
        items: {
          type: "object",
          properties: {
            personaname: {
              description: "The name used by the player",
              type: "string",
            },
            name_since: {
              description: "The date the name was used since",
              type: "string",
            },
          },
        },
      },
      profile: {
        description: "profile",
        type: "object",
        properties: {
          account_id: commonProperties.account_id,
          personaname: commonProperties.persona_name,
          name: commonProperties.general_name,
          plus: {
            description:
              "Boolean indicating status of current Dota Plus subscription",
            type: "boolean",
          },
          cheese: {
            description: "cheese",
            type: "integer",
            nullable: true,
          },
          steamid: {
            description: "steamid",
            type: "string",
            nullable: true,
          },
          avatar: {
            description: "avatar",
            type: "string",
            nullable: true,
          },
          avatarmedium: {
            description: "avatarmedium",
            type: "string",
            nullable: true,
          },
          avatarfull: {
            description: "avatarfull",
            type: "string",
            nullable: true,
          },
          profileurl: {
            description: "profileurl",
            type: "string",
            nullable: true,
          },
          last_login: {
            description: "last_login",
            type: "string",
            nullable: true,
          },
          loccountrycode: {
            description: "loccountrycode",
            type: "string",
            nullable: true,
          },
          is_contributor: {
            description:
              "Boolean indicating if the user contributed to the development of OpenDota",
            type: "boolean",
            default: false,
          },
          is_subscriber: {
            description:
              "Boolean indicating if the user subscribed to OpenDota",
            type: "boolean",
            default: false,
          },
        },
      },
    },
  },
};
