import commonProperties from './properties/commonProperties';

export default {
  HeroStatsResponse: {
    title: 'HeroStatsResponse',
    type: 'object',
    properties: {
      id: commonProperties.hero_id,
      name: commonProperties.hero_command_name,
      localized_name: commonProperties.hero_name,
      primary_attr: {
        description: 'primary_attr',
        type: 'string',
      },
      attack_type: {
        description: 'attack_type',
        type: 'string',
      },
      roles: {
        description: 'roles',
        type: 'array',
        items: {
          type: 'string',
        },
      },
      img: {
        description: 'img',
        type: 'string',
      },
      icon: {
        description: 'icon',
        type: 'string',
      },
      base_health: {
        description: 'base_health',
        type: 'integer',
      },
      base_health_regen: {
        description: 'base_health_regen',
        type: 'number',
      },
      base_mana: {
        description: 'base_mana',
        type: 'integer',
      },
      base_mana_regen: {
        description: 'base_mana_regen',
        type: 'integer',
      },
      base_armor: {
        description: 'base_armor',
        type: 'integer',
      },
      base_mr: {
        description: 'base_mr',
        type: 'integer',
      },
      base_attack_min: {
        description: 'base_attack_min',
        type: 'integer',
      },
      base_attack_max: {
        description: 'base_attack_max',
        type: 'integer',
      },
      base_str: {
        description: 'base_str',
        type: 'integer',
      },
      base_agi: {
        description: 'base_agi',
        type: 'integer',
      },
      base_int: {
        description: 'base_int',
        type: 'integer',
      },
      str_gain: {
        description: 'str_gain',
        type: 'number',
      },
      agi_gain: {
        description: 'agi_gain',
        type: 'number',
      },
      int_gain: {
        description: 'int_gain',
        type: 'number',
      },
      attack_range: {
        description: 'attack_range',
        type: 'integer',
      },
      projectile_speed: {
        description: 'projectile_speed',
        type: 'integer',
      },
      attack_rate: {
        description: 'attack_rate',
        type: 'number',
      },
      base_attack_time: {
        description: 'base_attack_time',
        type: 'integer',
      },
      attack_point: {
        description: 'attack_point',
        type: 'number',
      },
      move_speed: {
        description: 'move_speed',
        type: 'integer',
      },
      turn_rate: {
        description: 'turn_rate',
        type: 'number',
      },
      cm_enabled: {
        description: 'cm_enabled',
        type: 'boolean',
      },
      legs: {
        description: 'legs',
        type: 'integer',
      },
      day_vision: {
        description: 'day_vision',
        type: 'integer',
      },
      night_vision: {
        description: 'night_vision',
        type: 'integer',
      },
      hero_id: commonProperties.hero_id, // TODO: Duplicate
      turbo_picks: {
        description: 'Picks in Turbo mode this month',
        type: 'integer',
      },
      turbo_wins: {
        description: 'Wins in Turbo mode this month',
        type: 'integer',
      },
      pro_ban: {
        description: 'pro_ban',
        type: 'integer',
      },
      pro_win: {
        description: 'pro_win',
        type: 'integer',
      },
      pro_pick: {
        description: 'pro_pick',
        type: 'integer',
      },
      '1_pick': {
        description: 'Herald picks',
        type: 'integer',
      },
      '1_win': {
        description: 'Herald wins',
        type: 'integer',
      },
      '2_pick': {
        description: 'Guardian picks',
        type: 'integer',
      },
      '2_win': {
        description: 'Guardian wins',
        type: 'integer',
      },
      '3_pick': {
        description: 'Crusader picks',
        type: 'integer',
      },
      '3_win': {
        description: 'Crusader wins',
        type: 'integer',
      },
      '4_pick': {
        description: 'Archon picks',
        type: 'integer',
      },
      '4_win': {
        description: 'Archon wins',
        type: 'integer',
      },
      '5_pick': {
        description: 'Legend picks',
        type: 'integer',
      },
      '5_win': {
        description: 'Legend wins',
        type: 'integer',
      },
      '6_pick': {
        description: 'Ancient picks',
        type: 'integer',
      },
      '6_win': {
        description: 'Ancient wins',
        type: 'integer',
      },
      '7_pick': {
        description: 'Divine picks',
        type: 'integer',
      },
      '7_win': {
        description: 'Divine wins',
        type: 'integer',
      },
      '8_pick': {
        description: 'Immortal picks',
        type: 'integer',
      },
      '8_win': {
        description: 'Immortal wins',
        type: 'integer',
      },
    },
  },
};
