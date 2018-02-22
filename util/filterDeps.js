/**
 * Object listing dependent columns for each filter
 * */
module.exports = {
  win: ['player_slot', 'radiant_win'],
  patch: ['patch'],
  game_mode: ['game_mode'],
  lobby_type: ['lobby_type'],
  region: ['region'],
  date: ['start_time'],
  lane_role: ['lane_role'],
  hero_id: ['hero_id'],
  is_radiant: ['player_slot'],
  party_size: ['party_size'],
  included_account_id: ['heroes'],
  excluded_account_id: ['heroes'],
  with_hero_id: ['player_slot', 'heroes'],
  against_hero_id: ['player_slot', 'heroes'],
  significant: ['duration', 'game_mode', 'lobby_type', 'radiant_win'],
};
