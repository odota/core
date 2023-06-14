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
};
