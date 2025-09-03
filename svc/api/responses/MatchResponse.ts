import commonProperties from './properties/commonProperties.ts';

export default {
  MatchResponse: {
    title: 'MatchResponse',
    type: 'object',
    properties: {
      match_id: commonProperties.match_id,
      barracks_status_dire: {
        description:
          'Bitmask. An integer that represents a binary of which barracks are still standing. 63 would mean all barracks still stand at the end of the game.',
        type: 'integer',
      },
      barracks_status_radiant: {
        description:
          'Bitmask. An integer that represents a binary of which barracks are still standing. 63 would mean all barracks still stand at the end of the game.',
        type: 'integer',
      },
      chat: {
        description: 'Array containing information on the chat of the game',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: {
              description: 'Time in seconds at which the message was said',
              type: 'integer',
            },
            unit: {
              description: 'Name of the player who sent the message',
              type: 'string',
            },
            key: {
              description: 'The message the player sent',
              type: 'string',
            },
            slot: {
              description: 'slot',
              type: 'integer',
            },
            player_slot: commonProperties.player_slot,
          },
        },
      },
      cluster: {
        description: 'cluster',
        type: 'integer',
      },
      cosmetics: {
        description: 'cosmetics',
        type: 'object',
        additionalProperties: {
          type: 'integer',
        },
      },
      dire_score: commonProperties.dire_score,
      draft_timings: {
        description: 'draft_timings',
        type: 'array',
        items: {
          description: 'draft_stage',
          type: 'object',
          properties: {
            order: {
              description: 'order',
              type: 'integer',
            },
            pick: {
              description: 'pick',
              type: 'boolean',
            },
            active_team: {
              description: 'active_team',
              type: 'integer',
            },
            hero_id: commonProperties.hero_id,
            player_slot: commonProperties.player_slot,
            extra_time: {
              description: 'extra_time',
              type: 'integer',
            },
            total_time_taken: {
              description: 'total_time_taken',
              type: 'integer',
            },
          },
        },
      },
      duration: commonProperties.duration,
      engine: {
        description: 'engine',
        type: 'integer',
      },
      first_blood_time: {
        description: 'Time in seconds at which first blood occurred',
        type: 'integer',
      },
      game_mode: {
        description:
          'Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json',
        type: 'integer',
      },
      human_players: {
        description: 'Number of human players in the game',
        type: 'integer',
      },
      leagueid: {
        description: 'leagueid',
        type: 'integer',
      },
      lobby_type: {
        description:
          'Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json',
        type: 'integer',
      },
      match_seq_num: {
        description: 'match_seq_num',
        type: 'integer',
      },
      negative_votes: {
        description:
          'Number of negative votes the replay received in the in-game client',
        type: 'integer',
      },
      objectives: {
        description: 'objectives',
        type: 'array',
        items: {
          type: 'object',
        },
      },
      picks_bans: {
        description:
          'Array containing information on the draft. Each item contains a boolean relating to whether the choice is a pick or a ban, the hero ID, the team the picked or banned it, and the order.',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            is_pick: {
              description:
                'Boolean indicating whether the choice is a pick or a ban',
              type: 'boolean',
            },
            hero_id: commonProperties.hero_id,
            team: {
              description: 'The team that picked or banned the hero',
              type: 'integer',
            },
            order: {
              description: 'The order of the pick or ban',
              type: 'integer',
            },
          },
        },
      },
      positive_votes: {
        description:
          'Number of positive votes the replay received in the in-game client',
        type: 'integer',
      },
      radiant_gold_adv: {
        description:
          'Array of the Radiant gold advantage at each minute in the game. A negative number means that Radiant is behind, and thus it is their gold disadvantage. ',
        type: 'array',
        items: {
          type: 'number',
        },
      },
      radiant_score: commonProperties.radiant_score,
      radiant_win: commonProperties.radiant_win,
      radiant_xp_adv: {
        description:
          'Array of the Radiant experience advantage at each minute in the game. A negative number means that Radiant is behind, and thus it is their experience disadvantage. ',
        type: 'array',
        items: {
          type: 'number',
        },
      },
      start_time: commonProperties.start_time,
      teamfights: {
        description: 'teamfights',
        type: 'array',
        items: {
          type: 'object',
        },
        nullable: true,
      },
      tower_status_dire: {
        description:
          'Bitmask. An integer that represents a binary of which Dire towers are still standing.',
        type: 'integer',
      },
      tower_status_radiant: {
        description:
          'Bitmask. An integer that represents a binary of which Radiant towers are still standing.',
        type: 'integer',
      },
      version: {
        description: 'Parse version, used internally by OpenDota',
        type: 'integer',
      },
      replay_salt: {
        description: 'replay_salt',
        type: 'integer',
      },
      series_id: {
        description: 'series_id',
        type: 'integer',
      },
      series_type: {
        description: 'series_type',
        type: 'integer',
      },
      radiant_team: {
        description: 'radiant_team',
        type: 'object',
      },
      dire_team: {
        description: 'dire_team',
        type: 'object',
      },
      league: {
        description: 'league',
        type: 'object',
      },
      skill: {
        description:
          'Skill bracket assigned by Valve (Normal, High, Very High)',
        type: 'integer',
        nullable: true,
      },
      players: {
        description: 'Array of information on individual players',
        type: 'array',
        items: {
          description: 'player',
          type: 'object',
          properties: {
            match_id: commonProperties.match_id,
            player_slot: commonProperties.player_slot,
            ability_upgrades_arr: {
              description: 'An array describing how abilities were upgraded',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            ability_uses: {
              description:
                'Object containing information on how many times the played used their abilities',
              type: 'object',
            },
            ability_targets: {
              description:
                'Object containing information on who the player used their abilities on',
              type: 'object',
            },
            damage_targets: {
              description:
                'Object containing information on how and how much damage the player dealt to other heroes',
              type: 'object',
            },
            account_id: commonProperties.account_id,
            actions: {
              description:
                'Object containing information on how many and what type of actions the player issued to their hero',
              type: 'object',
            },
            additional_units: {
              description:
                'Object containing information on additional units the player had under their control',
              type: 'array',
              items: {
                type: 'object',
              },
              nullable: true,
            },
            assists: {
              description: 'Number of assists the player had',
              type: 'integer',
            },
            backpack_0: {
              description: 'Item in backpack slot 0',
              type: 'integer',
            },
            backpack_1: {
              description: 'Item in backpack slot 1',
              type: 'integer',
            },
            backpack_2: {
              description: 'Item in backpack slot 2',
              type: 'integer',
            },
            buyback_log: {
              description: 'Array containing information about buybacks',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description: 'Time in seconds the buyback occurred',
                    type: 'integer',
                  },
                  slot: {
                    description: 'slot',
                    type: 'integer',
                  },
                  player_slot: commonProperties.player_slot,
                },
              },
            },
            camps_stacked: {
              description: 'Number of camps stacked',
              type: 'integer',
            },
            connection_log: {
              description:
                "Array containing information about the player's disconnections and reconnections",
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description: 'Game time in seconds the event ocurred',
                    type: 'integer',
                  },
                  event: {
                    description: 'Event that occurred',
                    type: 'string',
                  },
                  player_slot: commonProperties.player_slot,
                },
              },
            },
            creeps_stacked: {
              description: 'Number of creeps stacked',
              type: 'integer',
            },
            damage: {
              description:
                'Object containing information about damage dealt by the player to different units',
              type: 'object',
            },
            damage_inflictor: {
              description:
                "Object containing information about about the sources of this player's damage to heroes",
              type: 'object',
            },
            damage_inflictor_received: {
              description:
                'Object containing information about the sources of damage received by this player from heroes',
              type: 'object',
            },
            damage_taken: {
              description:
                'Object containing information about from whom the player took damage',
              type: 'object',
            },
            deaths: {
              description: 'Number of deaths',
              type: 'integer',
            },
            denies: {
              description: 'Number of denies',
              type: 'integer',
            },
            dn_t: {
              description:
                'Array containing number of denies at different times of the match',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            gold: {
              description: 'Gold at the end of the game',
              type: 'integer',
            },
            gold_per_min: {
              description: 'Gold Per Minute obtained by this player',
              type: 'integer',
            },
            gold_reasons: {
              description:
                'Object containing information on how the player gainined gold over the course of the match',
              type: 'object',
            },
            gold_spent: {
              description: 'How much gold the player spent',
              type: 'integer',
            },
            gold_t: {
              description:
                'Array containing total gold at different times of the match',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            hero_damage: {
              description: 'Hero Damage Dealt',
              type: 'integer',
            },
            hero_healing: {
              description: 'Hero Healing Done',
              type: 'integer',
            },
            hero_hits: {
              description:
                'Object containing information on how many ticks of damages the hero inflicted with different spells and damage inflictors',
              type: 'object',
            },
            hero_id: commonProperties.hero_id,
            item_0: {
              description: "Item in the player's first slot",
              type: 'integer',
            },
            item_1: {
              description: "Item in the player's second slot",
              type: 'integer',
            },
            item_2: {
              description: "Item in the player's third slot",
              type: 'integer',
            },
            item_3: {
              description: "Item in the player's fourth slot",
              type: 'integer',
            },
            item_4: {
              description: "Item in the player's fifth slot",
              type: 'integer',
            },
            item_5: {
              description: "Item in the player's sixth slot",
              type: 'integer',
            },
            item_uses: {
              description:
                'Object containing information about how many times a player used items',
              type: 'object',
            },
            kill_streaks: {
              description:
                "Object containing information about the player's killstreaks",
              type: 'object',
            },
            killed: {
              description:
                'Object containing information about what units the player killed',
              type: 'object',
            },
            killed_by: {
              description:
                'Object containing information about who killed the player',
              type: 'object',
            },
            kills: {
              description: 'Number of kills',
              type: 'integer',
            },
            kills_log: {
              description:
                'Array containing information on which hero the player killed at what time',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description: 'Time in seconds the player killed the hero',
                    type: 'integer',
                  },
                  key: {
                    description: 'Hero killed',
                    type: 'string',
                  },
                },
              },
            },
            lane_pos: {
              description: 'Object containing information on lane position',
              type: 'object',
            },
            last_hits: {
              description: 'Number of last hits',
              type: 'integer',
            },
            leaver_status: {
              description:
                "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
              type: 'integer',
            },
            level: {
              description: 'Level at the end of the game',
              type: 'integer',
            },
            lh_t: {
              description:
                'Array describing last hits at each minute in the game',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            life_state: {
              description: 'life_state',
              type: 'object',
            },
            max_hero_hit: {
              description:
                'Object with information on the highest damage instance the player inflicted',
              type: 'object',
            },
            multi_kills: {
              description:
                'Object with information on the number of the number of multikills the player had',
              type: 'object',
            },
            obs: {
              description:
                'Object with information on where the player placed observer wards. The location takes the form (outer number, inner number) and are from ~64-192.',
              type: 'object',
            },
            obs_left_log: {
              description: 'obs_left_log',
              type: 'array',
              items: {
                type: 'object',
              },
            },
            obs_log: {
              description:
                'Object containing information on when and where the player placed observer wards',
              type: 'array',
              items: {
                type: 'object',
              },
            },
            obs_placed: {
              description: 'Total number of observer wards placed',
              type: 'integer',
            },
            party_id: {
              description: 'party_id',
              type: 'integer',
            },
            permanent_buffs: {
              description:
                'Array describing permanent buffs the player had at the end of the game. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/permanent_buffs.json',
              type: 'array',
              items: {
                type: 'object',
              },
            },
            hero_variant: {
              description:
                '1-indexed facet, see https://github.com/odota/dotaconstants/blob/master/build/hero_abilities.json',
              type: 'integer',
            },
            pings: {
              description: 'Total number of pings',
              type: 'integer',
            },
            purchase: {
              description:
                'Object containing information on the items the player purchased',
              type: 'object',
            },
            purchase_log: {
              description:
                'Object containing information on when items were purchased',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description: 'Time in seconds the item was bought',
                    type: 'integer',
                  },
                  key: {
                    description: 'String item ID',
                    type: 'string',
                  },
                  charges: {
                    description: 'Integer amount of charges',
                    type: 'integer',
                  },
                },
              },
            },
            rune_pickups: {
              description: 'Number of runes picked up',
              type: 'integer',
            },
            runes: {
              description:
                'Object with information about which runes the player picked up',
              type: 'object',
              additionalProperties: {
                type: 'integer',
              },
            },
            runes_log: {
              description:
                'Array with information on when runes were picked up',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description: 'Time in seconds rune picked up',
                    type: 'integer',
                  },
                  key: {
                    description: 'key',
                    type: 'integer',
                  },
                },
              },
            },
            sen: {
              description:
                'Object with information on where sentries were placed. The location takes the form (outer number, inner number) and are from ~64-192.',
              type: 'object',
            },
            sen_left_log: {
              description:
                'Array containing information on when and where the player placed sentries',
              type: 'array',
              items: {
                type: 'object',
              },
            },
            sen_log: {
              description:
                'Array with information on when and where sentries were placed by the player',
              type: 'array',
              items: {
                type: 'object',
              },
            },
            sen_placed: {
              description: 'How many sentries were placed by the player',
              type: 'integer',
            },
            stuns: {
              description: 'Total stun duration of all stuns by the player',
              type: 'number',
            },
            times: {
              description:
                'Time in seconds corresponding to the time of entries of other arrays in the match.',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            tower_damage: {
              description: 'Total tower damage done by the player',
              type: 'integer',
            },
            xp_per_min: {
              description: 'Experience Per Minute obtained by the player',
              type: 'integer',
            },
            xp_reasons: {
              description:
                "Object containing information on the sources of this player's experience",
              type: 'object',
            },
            xp_t: {
              description: 'Experience at each minute of the game',
              type: 'array',
              items: {
                type: 'integer',
              },
            },
            personaname: commonProperties.persona_name,
            name: commonProperties.general_name,
            last_login: {
              description: "Time of player's last login",
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            radiant_win: commonProperties.radiant_win,
            start_time: commonProperties.start_time,
            duration: commonProperties.duration,
            cluster: {
              description: 'cluster',
              type: 'integer',
            },
            lobby_type: {
              description:
                'Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json',
              type: 'integer',
            },
            game_mode: {
              description:
                'Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json',
              type: 'integer',
            },
            patch: {
              description: 'Patch ID, from dotaconstants',
              type: 'integer',
            },
            region: {
              description:
                'Integer corresponding to the region the game was played on',
              type: 'integer',
            },
            isRadiant: {
              description:
                'Boolean for whether or not the player is on Radiant',
              type: 'boolean',
            },
            win: {
              description:
                'Binary integer representing whether or not the player won',
              type: 'integer',
            },
            lose: {
              description:
                'Binary integer representing whether or not the player lost',
              type: 'integer',
            },
            total_gold: {
              description: 'Total gold at the end of the game',
              type: 'integer',
            },
            total_xp: {
              description: 'Total experience at the end of the game',
              type: 'integer',
            },
            kills_per_min: {
              description: 'Number of kills per minute',
              type: 'number',
            },
            kda: {
              description: 'kda',
              type: 'number',
            },
            abandons: {
              description: 'abandons',
              type: 'integer',
            },
            neutral_kills: {
              description: 'Total number of neutral creeps killed',
              type: 'integer',
            },
            tower_kills: {
              description: 'Total number of tower kills the player had',
              type: 'integer',
            },
            courier_kills: {
              description: 'Total number of courier kills the player had',
              type: 'integer',
            },
            lane_kills: {
              description: 'Total number of lane creeps killed by the player',
              type: 'integer',
            },
            hero_kills: {
              description: 'Total number of heroes killed by the player',
              type: 'integer',
            },
            observer_kills: {
              description:
                'Total number of observer wards killed by the player',
              type: 'integer',
            },
            sentry_kills: {
              description: 'Total number of sentry wards killed by the player',
              type: 'integer',
            },
            roshan_kills: {
              description:
                'Total number of roshan kills (last hit on roshan) the player had',
              type: 'integer',
            },
            necronomicon_kills: {
              description:
                'Total number of Necronomicon creeps killed by the player',
              type: 'integer',
            },
            ancient_kills: {
              description:
                'Total number of Ancient creeps killed by the player',
              type: 'integer',
            },
            buyback_count: {
              description: 'Total number of buyback the player used',
              type: 'integer',
            },
            observer_uses: {
              description: 'Number of observer wards used',
              type: 'integer',
            },
            sentry_uses: {
              description: 'Number of sentry wards used',
              type: 'integer',
            },
            lane_efficiency: {
              description: 'lane_efficiency',
              type: 'number',
            },
            lane_efficiency_pct: {
              description: 'lane_efficiency_pct',
              type: 'number',
            },
            lane: {
              description: 'Integer referring to which lane the hero laned in',
              type: 'integer',
              nullable: true,
            },
            lane_role: {
              description: 'lane_role',
              type: 'integer',
              nullable: true,
            },
            is_roaming: {
              description:
                'Boolean referring to whether or not the player roamed',
              type: 'boolean',
              nullable: true,
            },
            purchase_time: {
              description:
                'Object with information on when the player last purchased an item',
              type: 'object',
            },
            first_purchase_time: {
              description:
                'Object with information on when the player first puchased an item',
              type: 'object',
            },
            item_win: {
              description:
                'Object with information on whether or not the item won',
              type: 'object',
            },
            item_usage: {
              description:
                'Object containing binary integers the tell whether the item was purchased by the player (note: this is always 1)',
              type: 'object',
            },
            purchase_tpscroll: {
              description: 'Total number of TP scrolls purchased by the player',
              type: 'integer',
            },
            actions_per_min: {
              description: 'Actions per minute',
              type: 'integer',
            },
            life_state_dead: {
              description: 'life_state_dead',
              type: 'integer',
            },
            rank_tier: {
              description:
                'The rank tier of the player. Tens place indicates rank, ones place indicates stars.',
              type: 'integer',
            },
            cosmetics: {
              description: 'cosmetics',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  item_id: {
                    type: 'integer',
                  },
                  name: commonProperties.general_name,
                  prefab: {
                    type: 'string',
                  },
                  creation_date: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true,
                  },
                  image_inventory: {
                    type: 'string',
                    nullable: true,
                  },
                  image_path: {
                    type: 'string',
                    nullable: true,
                  },
                  item_description: {
                    type: 'string',
                    nullable: true,
                  },
                  item_name: {
                    type: 'string',
                  },
                  item_rarity: {
                    type: 'string',
                    nullable: true,
                  },
                  item_type_name: {
                    type: 'string',
                    nullable: true,
                  },
                  used_by_heroes: {
                    type: 'string',
                    nullable: true,
                  },
                },
              },
            },
            benchmarks: {
              description:
                'Object containing information on certain benchmarks like GPM, XPM, KDA, tower damage, etc',
              type: 'object',
            },
            neutral_tokens_log: {
              description:
                'Object containing information on neutral tokens drops',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description:
                      'Time in seconds at which the token was dropped',
                    type: 'integer',
                  },
                  key: {
                    description: 'Type of token dropped',
                    type: 'string',
                  },
                },
              },
            },
            neutral_item_history: {
              description:
                'Object containing information on neutral item history',
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: {
                    description:
                      'Time in seconds at which the item was crafted',
                    type: 'integer',
                  },
                  item_neutral: {
                    description: 'Neutral item name',
                    type: 'string',
                  },
                  item_neutral_enhancement: {
                    description: 'Neutral enhancement name',
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
      patch: {
        description: 'Patch ID, from dotaconstants',
        type: 'integer',
      },
      region: {
        description:
          'Integer corresponding to the region the game was played on',
        type: 'integer',
      },
      all_word_counts: {
        description:
          "Word counts of the all chat messages in the player's games",
        type: 'object',
      },
      my_word_counts: {
        description: "Word counts of the player's all chat messages",
        type: 'object',
      },
      throw: {
        description:
          "Maximum gold advantage of the player's team if they lost the match",
        type: 'integer',
      },
      comeback: {
        description:
          "Maximum gold disadvantage of the player's team if they won the match",
        type: 'integer',
      },
      loss: {
        description:
          "Maximum gold disadvantage of the player's team if they lost the match",
        type: 'integer',
      },
      win: {
        description:
          "Maximum gold advantage of the player's team if they won the match",
        type: 'integer',
      },
      replay_url: {
        description: 'replay_url',
        type: 'string',
      },
      pauses: {
        description:
          'Array containing information about pauses during the game. Each item contains the time and duration of the pause.',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: {
              description: 'Time in seconds at which pause started',
              type: 'integer',
            },
            duration: {
              description: 'The duration of the pause',
              type: 'integer',
            },
          },
        },
      },
    },
  },
};
