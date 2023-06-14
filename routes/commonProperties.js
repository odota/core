module.exports = {
  hero_id: {
    description: "The ID value of the hero played",
    type: "integer",
  },
  match_id: {
    description: "The ID number of the match assigned by Valve",
    type: "integer",
    example: 3703866531,
  },
  radiant_win: {
    description: "Boolean indicating whether Radiant won the match",
    type: "boolean",
    nullable: true,
  },
  player_slot: {
    description:
      "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
    type: "integer",
    nullable: true,
  },
  duration: {
    description: "Duration of the game in seconds",
    type: "integer",
  },
  start_time: {
    description: "The Unix timestamp at which the game started",
    type: "integer",
  },
  dire_score: {
    description: "Number of kills the Dire team had when the match ended",
    type: "integer",
  },
  radiant_score: {
    description: "Number of kills the Radiant team had when the match ended",
    type: "integer",
  },
  account_id: {
    description: "The player account ID",
    type: "string",
  },
  hero_name: {
    description: "Hero name",
    type: "string",
    example: "Anti-Mage",
  },
  persona_name: {
    description: "Player's Steam name",
    type: "string",
    nullable: true,
    example: "420 booty wizard",
  },
};
