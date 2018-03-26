module.exports = {
  radiant_win: {
    description: 'Boolean indicating whether Radiant won the match',
    type: 'boolean',
  },
  player_slot: {
    description: 'Which slot the player is in. 0-127 are Radiant, 128-255 are Dire',
    type: 'integer',
  },
  duration: {
    description: 'Duration of the game in seconds',
    type: 'integer',
  },
};
