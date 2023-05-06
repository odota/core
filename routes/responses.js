module.exports = {
  MatchResponse: {
    title: "MatchResponse",
    type: "object",
    properties: {
      match_id: {
        description: "The ID number of the match assigned by Valve",
        type: "integer",
      },
      barracks_status_dire: {
        description:
          "Bitmask. An integer that represents a binary of which barracks are still standing. 63 would mean all barracks still stand at the end of the game.",
        type: "integer",
      },
      barracks_status_radiant: {
        description:
          "Bitmask. An integer that represents a binary of which barracks are still standing. 63 would mean all barracks still stand at the end of the game.",
        type: "integer",
      },
      chat: {
        description: "Array containing information on the chat of the game",
        type: "array",
        items: {
          type: "object",
          properties: {
            time: {
              description: "Time in seconds at which the message was said",
              type: "integer",
            },
            unit: {
              description: "Name of the player who sent the message",
              type: "string",
            },
            key: {
              description: "The message the player sent",
              type: "string",
            },
            slot: {
              description: "slot",
              type: "integer",
            },
            player_slot: {
              description:
                "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
              type: "integer",
            },
          },
        },
      },
      cluster: {
        description: "cluster",
        type: "integer",
      },
      cosmetics: {
        description: "cosmetics",
        type: "object",
        additionalProperties: {
          type: "integer",
        },
      },
      dire_score: {
        description: "Final score for Dire (number of kills on Radiant)",
        type: "integer",
      },
      draft_timings: {
        description: "draft_timings",
        type: "array",
        items: {
          description: "draft_stage",
          type: "object",
          properties: {
            order: {
              description: "order",
              type: "integer",
            },
            pick: {
              description: "pick",
              type: "boolean",
            },
            active_team: {
              description: "active_team",
              type: "integer",
            },
            hero_id: {
              description: "The ID value of the hero played",
              type: "integer",
            },
            player_slot: {
              description:
                "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
              type: "integer",
            },
            extra_time: {
              description: "extra_time",
              type: "integer",
            },
            total_time_taken: {
              description: "total_time_taken",
              type: "integer",
            },
          },
        },
      },
      duration: {
        description: "Duration of the game in seconds",
        type: "integer",
      },
      engine: {
        description: "engine",
        type: "integer",
      },
      first_blood_time: {
        description: "Time in seconds at which first blood occurred",
        type: "integer",
      },
      game_mode: {
        description:
          "Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json",
        type: "integer",
      },
      human_players: {
        description: "Number of human players in the game",
        type: "integer",
      },
      leagueid: {
        description: "leagueid",
        type: "integer",
      },
      lobby_type: {
        description:
          "Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json",
        type: "integer",
      },
      match_seq_num: {
        description: "match_seq_num",
        type: "integer",
      },
      negative_votes: {
        description:
          "Number of negative votes the replay received in the in-game client",
        type: "integer",
      },
      objectives: {
        description: "objectives",
        type: "array",
        items: {
          type: "object",
        },
      },
      picks_bans: {
        description:
          "Object containing information on the draft. Each pick/ban contains a boolean relating to whether the choice is a pick or a ban, the hero ID, the team the picked or banned it, and the order.",
        type: "array",
        items: {
          type: "object",
        },
      },
      positive_votes: {
        description:
          "Number of positive votes the replay received in the in-game client",
        type: "integer",
      },
      radiant_gold_adv: {
        description:
          "Array of the Radiant gold advantage at each minute in the game. A negative number means that Radiant is behind, and thus it is their gold disadvantage. ",
        type: "array",
        items: {
          type: "number",
        },
      },
      radiant_score: {
        description: "Final score for Radiant (number of kills on Radiant)",
        type: "integer",
      },
      radiant_win: {
        description: "Boolean indicating whether Radiant won the match",
        type: "boolean",
      },
      radiant_xp_adv: {
        description:
          "Array of the Radiant experience advantage at each minute in the game. A negative number means that Radiant is behind, and thus it is their experience disadvantage. ",
        type: "array",
        items: {
          type: "number",
        },
      },
      start_time: {
        description: "The Unix timestamp at which the game started",
        type: "integer",
      },
      teamfights: {
        description: "teamfights",
        type: "array",
        items: {
          type: "array",
          items: {
            type: "object",
          },
        },
      },
      tower_status_dire: {
        description:
          "Bitmask. An integer that represents a binary of which Dire towers are still standing.",
        type: "integer",
      },
      tower_status_radiant: {
        description:
          "Bitmask. An integer that represents a binary of which Radiant towers are still standing.",
        type: "integer",
      },
      version: {
        description: "Parse version, used internally by OpenDota",
        type: "integer",
      },
      replay_salt: {
        description: "replay_salt",
        type: "integer",
      },
      series_id: {
        description: "series_id",
        type: "integer",
      },
      series_type: {
        description: "series_type",
        type: "integer",
      },
      radiant_team: {
        description: "radiant_team",
        type: "object",
      },
      dire_team: {
        description: "dire_team",
        type: "object",
      },
      league: {
        description: "league",
        type: "object",
      },
      skill: {
        description:
          "Skill bracket assigned by Valve (Normal, High, Very High)",
        type: "integer",
      },
      players: {
        description: "Array of information on individual players",
        type: "array",
        items: {
          description: "player",
          type: "object",
          properties: {
            match_id: {
              description: "Match ID",
              type: "integer",
            },
            player_slot: {
              description:
                "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
              type: "integer",
            },
            ability_upgrades_arr: {
              description: "An array describing how abilities were upgraded",
              type: "array",
              items: {
                type: "integer",
              },
            },
            ability_uses: {
              description:
                "Object containing information on how many times the played used their abilities",
              type: "object",
            },
            ability_targets: {
              description:
                "Object containing information on who the player used their abilities on",
              type: "object",
            },
            damage_targets: {
              description:
                "Object containing information on how and how much damage the player dealt to other heroes",
              type: "object",
            },
            account_id: {
              description: "account_id",
              type: "integer",
            },
            actions: {
              description:
                "Object containing information on how many and what type of actions the player issued to their hero",
              type: "object",
            },
            additional_units: {
              description:
                "Object containing information on additional units the player had under their control",
              type: "array",
              items: {
                type: "object",
              },
              nullable: true,
            },
            assists: {
              description: "Number of assists the player had",
              type: "integer",
            },
            backpack_0: {
              description: "Item in backpack slot 0",
              type: "integer",
            },
            backpack_1: {
              description: "Item in backpack slot 1",
              type: "integer",
            },
            backpack_2: {
              description: "Item in backpack slot 2",
              type: "integer",
            },
            buyback_log: {
              description: "Array containing information about buybacks",
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: {
                    description: "Time in seconds the buyback occurred",
                    type: "integer",
                  },
                  slot: {
                    description: "slot",
                    type: "integer",
                  },
                  player_slot: {
                    description:
                      "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
                    type: "integer",
                  },
                },
              },
            },
            camps_stacked: {
              description: "Number of camps stacked",
              type: "integer",
            },
            connection_log: {
              description:
                "Array containing information about the player's disconnections and reconnections",
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: {
                    description: "Game time in seconds the event ocurred",
                    type: "integer",
                  },
                  event: {
                    description: "Event that occurred",
                    type: "string",
                  },
                  player_slot: {
                    description:
                      "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
                    type: "integer",
                  },
                },
              },
            },
            creeps_stacked: {
              description: "Number of creeps stacked",
              type: "integer",
            },
            damage: {
              description:
                "Object containing information about damage dealt by the player to different units",
              type: "object",
            },
            damage_inflictor: {
              description:
                "Object containing information about about the sources of this player's damage to heroes",
              type: "object",
            },
            damage_inflictor_received: {
              description:
                "Object containing information about the sources of damage received by this player from heroes",
              type: "object",
            },
            damage_taken: {
              description:
                "Object containing information about from whom the player took damage",
              type: "object",
            },
            deaths: {
              description: "Number of deaths",
              type: "integer",
            },
            denies: {
              description: "Number of denies",
              type: "integer",
            },
            dn_t: {
              description:
                "Array containing number of denies at different times of the match",
              type: "array",
              items: {
                type: "integer",
              },
            },
            gold: {
              description: "Gold at the end of the game",
              type: "integer",
            },
            gold_per_min: {
              description: "Gold Per Minute obtained by this player",
              type: "integer",
            },
            gold_reasons: {
              description:
                "Object containing information on how the player gainined gold over the course of the match",
              type: "object",
            },
            gold_spent: {
              description: "How much gold the player spent",
              type: "integer",
            },
            gold_t: {
              description:
                "Array containing total gold at different times of the match",
              type: "array",
              items: {
                type: "integer",
              },
            },
            hero_damage: {
              description: "Hero Damage Dealt",
              type: "integer",
            },
            hero_healing: {
              description: "Hero Healing Done",
              type: "integer",
            },
            hero_hits: {
              description:
                "Object containing information on how many ticks of damages the hero inflicted with different spells and damage inflictors",
              type: "object",
            },
            hero_id: {
              description: "The ID value of the hero played",
              type: "integer",
            },
            item_0: {
              description: "Item in the player's first slot",
              type: "integer",
            },
            item_1: {
              description: "Item in the player's second slot",
              type: "integer",
            },
            item_2: {
              description: "Item in the player's third slot",
              type: "integer",
            },
            item_3: {
              description: "Item in the player's fourth slot",
              type: "integer",
            },
            item_4: {
              description: "Item in the player's fifth slot",
              type: "integer",
            },
            item_5: {
              description: "Item in the player's sixth slot",
              type: "integer",
            },
            item_uses: {
              description:
                "Object containing information about how many times a player used items",
              type: "object",
            },
            kill_streaks: {
              description:
                "Object containing information about the player's killstreaks",
              type: "object",
            },
            killed: {
              description:
                "Object containing information about what units the player killed",
              type: "object",
            },
            killed_by: {
              description:
                "Object containing information about who killed the player",
              type: "object",
            },
            kills: {
              description: "Number of kills",
              type: "integer",
            },
            kills_log: {
              description:
                "Array containing information on which hero the player killed at what time",
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: {
                    description: "Time in seconds the player killed the hero",
                    type: "integer",
                  },
                  key: {
                    description: "Hero killed",
                    type: "string",
                  },
                },
              },
            },
            lane_pos: {
              description: "Object containing information on lane position",
              type: "object",
            },
            last_hits: {
              description: "Number of last hits",
              type: "integer",
            },
            leaver_status: {
              description:
                "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
              type: "integer",
            },
            level: {
              description: "Level at the end of the game",
              type: "integer",
            },
            lh_t: {
              description:
                "Array describing last hits at each minute in the game",
              type: "array",
              items: {
                type: "integer",
              },
            },
            life_state: {
              description: "life_state",
              type: "object",
            },
            max_hero_hit: {
              description:
                "Object with information on the highest damage instance the player inflicted",
              type: "object",
            },
            multi_kills: {
              description:
                "Object with information on the number of the number of multikills the player had",
              type: "object",
            },
            obs: {
              description:
                "Object with information on where the player placed observer wards. The location takes the form (outer number, inner number) and are from ~64-192.",
              type: "object",
            },
            obs_left_log: {
              description: "obs_left_log",
              type: "array",
              items: {
                type: "object",
              },
            },
            obs_log: {
              description:
                "Object containing information on when and where the player placed observer wards",
              type: "array",
              items: {
                type: "object",
              },
            },
            obs_placed: {
              description: "Total number of observer wards placed",
              type: "integer",
            },
            party_id: {
              description: "party_id",
              type: "integer",
            },
            permanent_buffs: {
              description:
                "Array describing permanent buffs the player had at the end of the game. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/permanent_buffs.json",
              type: "array",
              items: {
                type: "object",
              },
            },
            pings: {
              description: "Total number of pings",
              type: "integer",
            },
            purchase: {
              description:
                "Object containing information on the items the player purchased",
              type: "object",
            },
            purchase_log: {
              description:
                "Object containing information on when items were purchased",
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: {
                    description: "Time in seconds the item was bought",
                    type: "integer",
                  },
                  key: {
                    description: "String item ID",
                    type: "string",
                  },
                  charges: {
                    description: "Integer amount of charges",
                    type: "integer",
                  },
                },
              },
            },
            rune_pickups: {
              description: "Number of runes picked up",
              type: "integer",
            },
            runes: {
              description:
                "Object with information about which runes the player picked up",
              type: "object",
              additionalProperties: {
                type: "integer",
              },
            },
            runes_log: {
              description:
                "Array with information on when runes were picked up",
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: {
                    description: "Time in seconds rune picked up",
                    type: "integer",
                  },
                  key: {
                    description: "key",
                    type: "integer",
                  },
                },
              },
            },
            sen: {
              description:
                "Object with information on where sentries were placed. The location takes the form (outer number, inner number) and are from ~64-192.",
              type: "object",
            },
            sen_left_log: {
              description:
                "Array containing information on when and where the player placed sentries",
              type: "array",
              items: {
                type: "object",
              },
            },
            sen_log: {
              description:
                "Array with information on when and where sentries were placed by the player",
              type: "array",
              items: {
                type: "object",
              },
            },
            sen_placed: {
              description: "How many sentries were placed by the player",
              type: "integer",
            },
            stuns: {
              description: "Total stun duration of all stuns by the player",
              type: "number",
            },
            times: {
              description:
                "Time in seconds corresponding to the time of entries of other arrays in the match.",
              type: "array",
              items: {
                type: "integer",
              },
            },
            tower_damage: {
              description: "Total tower damage done by the player",
              type: "integer",
            },
            xp_per_min: {
              description: "Experience Per Minute obtained by the player",
              type: "integer",
            },
            xp_reasons: {
              description:
                "Object containing information on the sources of this player's experience",
              type: "object",
            },
            xp_t: {
              description: "Experience at each minute of the game",
              type: "array",
              items: {
                type: "integer",
              },
            },
            personaname: {
              description: "personaname",
              type: "string",
              nullable: true,
            },
            name: {
              description: "name",
              type: "string",
              nullable: true,
            },
            last_login: {
              description: "Time of player's last login",
              type: "string",
              format: "date-time",
              nullable: true,
            },
            radiant_win: {
              description: "Boolean indicating whether Radiant won the match",
              type: "boolean",
            },
            start_time: {
              description: "Start time of the match in seconds since 1970",
              type: "integer",
            },
            duration: {
              description: "Duration of the game in seconds",
              type: "integer",
            },
            cluster: {
              description: "cluster",
              type: "integer",
            },
            lobby_type: {
              description:
                "Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json",
              type: "integer",
            },
            game_mode: {
              description:
                "Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json",
              type: "integer",
            },
            patch: {
              description:
                "Integer representing the patch the game was played on",
              type: "integer",
            },
            region: {
              description:
                "Integer corresponding to the region the game was played on",
              type: "integer",
            },
            isRadiant: {
              description:
                "Boolean for whether or not the player is on Radiant",
              type: "boolean",
            },
            win: {
              description:
                "Binary integer representing whether or not the player won",
              type: "integer",
            },
            lose: {
              description:
                "Binary integer representing whether or not the player lost",
              type: "integer",
            },
            total_gold: {
              description: "Total gold at the end of the game",
              type: "integer",
            },
            total_xp: {
              description: "Total experience at the end of the game",
              type: "integer",
            },
            kills_per_min: {
              description: "Number of kills per minute",
              type: "number",
            },
            kda: {
              description: "kda",
              type: "number",
            },
            abandons: {
              description: "abandons",
              type: "integer",
            },
            neutral_kills: {
              description: "Total number of neutral creeps killed",
              type: "integer",
            },
            tower_kills: {
              description: "Total number of tower kills the player had",
              type: "integer",
            },
            courier_kills: {
              description: "Total number of courier kills the player had",
              type: "integer",
            },
            lane_kills: {
              description: "Total number of lane creeps killed by the player",
              type: "integer",
            },
            hero_kills: {
              description: "Total number of heroes killed by the player",
              type: "integer",
            },
            observer_kills: {
              description:
                "Total number of observer wards killed by the player",
              type: "integer",
            },
            sentry_kills: {
              description: "Total number of sentry wards killed by the player",
              type: "integer",
            },
            roshan_kills: {
              description:
                "Total number of roshan kills (last hit on roshan) the player had",
              type: "integer",
            },
            necronomicon_kills: {
              description:
                "Total number of Necronomicon creeps killed by the player",
              type: "integer",
            },
            ancient_kills: {
              description:
                "Total number of Ancient creeps killed by the player",
              type: "integer",
            },
            buyback_count: {
              description: "Total number of buyback the player used",
              type: "integer",
            },
            observer_uses: {
              description: "Number of observer wards used",
              type: "integer",
            },
            sentry_uses: {
              description: "Number of sentry wards used",
              type: "integer",
            },
            lane_efficiency: {
              description: "lane_efficiency",
              type: "number",
            },
            lane_efficiency_pct: {
              description: "lane_efficiency_pct",
              type: "number",
            },
            lane: {
              description: "Integer referring to which lane the hero laned in",
              type: "integer",
              nullable: true,
            },
            lane_role: {
              description: "lane_role",
              type: "integer",
              nullable: true,
            },
            is_roaming: {
              description:
                "Boolean referring to whether or not the player roamed",
              type: "boolean",
              nullable: true,
            },
            purchase_time: {
              description:
                "Object with information on when the player last purchased an item",
              type: "object",
            },
            first_purchase_time: {
              description:
                "Object with information on when the player first puchased an item",
              type: "object",
            },
            item_win: {
              description:
                "Object with information on whether or not the item won",
              type: "object",
            },
            item_usage: {
              description:
                "Object containing binary integers the tell whether the item was purchased by the player (note: this is always 1)",
              type: "object",
            },
            purchase_tpscroll: {
              description: "Total number of TP scrolls purchased by the player",
              type: "integer",
            },
            actions_per_min: {
              description: "Actions per minute",
              type: "integer",
            },
            life_state_dead: {
              description: "life_state_dead",
              type: "integer",
            },
            rank_tier: {
              description:
                "The rank tier of the player. Tens place indicates rank, ones place indicates stars.",
              type: "integer",
            },
            cosmetics: {
              description: "cosmetics",
              type: "array",
              items: {
                type: "object",
                properties: {
                  item_id: {
                    type: "integer",
                  },
                  name: {
                    type: "string",
                  },
                  prefab: {
                    type: "string",
                  },
                  creation_date: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  image_inventory: {
                    type: "string",
                    nullable: true,
                  },
                  image_path: {
                    type: "string",
                    nullable: true,
                  },
                  item_description: {
                    type: "string",
                    nullable: true,
                  },
                  item_name: {
                    type: "string",
                  },
                  item_rarity: {
                    type: "string",
                    nullable: true,
                  },
                  item_type_name: {
                    type: "string",
                    nullable: true,
                  },
                  used_by_heroes: {
                    type: "string",
                    nullable: true,
                  },
                },
              },
            },
            benchmarks: {
              description:
                "Object containing information on certain benchmarks like GPM, XPM, KDA, tower damage, etc",
              type: "object",
            },
          },
        },
      },
      patch: {
        description: "Information on the patch version the game is played on",
        type: "integer",
      },
      region: {
        description:
          "Integer corresponding to the region the game was played on",
        type: "integer",
      },
      all_word_counts: {
        description:
          "Word counts of the all chat messages in the player's games",
        type: "object",
      },
      my_word_counts: {
        description: "Word counts of the player's all chat messages",
        type: "object",
      },
      throw: {
        description:
          "Maximum gold advantage of the player's team if they lost the match",
        type: "integer",
      },
      comeback: {
        description:
          "Maximum gold disadvantage of the player's team if they won the match",
        type: "integer",
      },
      loss: {
        description:
          "Maximum gold disadvantage of the player's team if they lost the match",
        type: "integer",
      },
      win: {
        description:
          "Maximum gold advantage of the player's team if they won the match",
        type: "integer",
      },
      replay_url: {
        description: "replay_url",
        type: "string",
      },
    },
  },
  PlayersByRankResponse: {
    title: "PlayersByRankResponse",
    type: "array",
    items: {
      type: "object",
      properties: {
        account_id: {
          description: "account_id",
          type: "number",
        },
        rank_tier: {
          description: "Integer indicating the rank/medal of the player",
          type: "number",
        },
        fh_unavailable: {
          description:
            "Indicates if we were unable to fetch full history for this player due to privacy settings",
          type: "boolean",
          nullable: true,
        },
      },
    },
  },
  PlayersResponse: {
    title: "PlayerResponse",
    type: "object",
    properties: {
      solo_competitive_rank: {
        description: "solo_competitive_rank",
        type: "integer",
        nullable: true,
      },
      competitive_rank: {
        description: "competitive_rank",
        type: "integer",
        nullable: true,
      },
      rank_tier: {
        description: "rank_tier",
        type: "number",
        nullable: true,
      },
      leaderboard_rank: {
        description: "leaderboard_rank",
        type: "number",
        nullable: true,
      },
      mmr_estimate: {
        description: "mmr_estimate",
        type: "object",
        properties: {
          estimate: {
            description: "estimate",
            type: "number",
            nullable: true,
          },
        },
      },
      profile: {
        description: "profile",
        type: "object",
        properties: {
          account_id: {
            description: "account_id",
            type: "integer",
          },
          personaname: {
            description: "personaname",
            type: "string",
            nullable: true,
          },
          name: {
            description: "name",
            type: "string",
            nullable: true,
          },
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
  PlayerWinLossResponse: {
    title: "PlayerWinLossResponse",
    type: "object",
    properties: {
      win: {
        description: "Number of wins",
        type: "integer",
      },
      lose: {
        description: "Number of loses",
        type: "integer",
      },
    },
  },
  PlayerRecentMatchesResponse: {
    title: "PlayerRecentMatchesResponse",
    description: "match",
    type: "object",
    properties: {
      match_id: {
        description: "Match ID",
        type: "integer",
      },
      player_slot: {
        description:
          "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
        type: "integer",
      },
      radiant_win: {
        description: "Boolean indicating whether Radiant won the match",
        type: "boolean",
      },
      duration: {
        description: "Duration of the game in seconds",
        type: "integer",
      },
      game_mode: {
        description:
          "Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json",
        type: "integer",
      },
      lobby_type: {
        description:
          "Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json",
        type: "integer",
      },
      hero_id: {
        description: "The ID value of the hero played",
        type: "integer",
      },
      start_time: {
        description: "Start time of the match in seconds elapsed since 1970",
        type: "integer",
      },
      version: {
        description: "version",
        type: "integer",
        nullable: true,
      },
      kills: {
        description: "Total kills the player had at the end of the match",
        type: "integer",
      },
      deaths: {
        description: "Total deaths the player had at the end of the match",
        type: "integer",
      },
      assists: {
        description: "Total assists the player had at the end of the match",
        type: "integer",
      },
      skill: {
        description:
          "Skill bracket assigned by Valve (Normal, High, Very High). If the skill is unknown, will return null.",
        type: "integer",
        nullable: true,
      },
      average_rank: {
        description: "Average rank of players with public match data",
        type: "integer",
        nullable: true,
      },
      xp_per_min: {
        description: "Experience Per Minute obtained by the player",
        type: "integer",
      },
      gold_per_min: {
        description: "Average gold per minute of the player",
        type: "integer",
      },
      hero_damage: {
        description: "Total hero damage to enemy heroes",
        type: "integer",
      },
      hero_healing: {
        description: "Total healing of ally heroes",
        type: "integer",
      },
      last_hits: {
        description: "Total last hits the player had at the end of the match",
        type: "integer",
      },
      lane: {
        description:
          "Integer corresponding to which lane the player laned in for the match",
        type: "integer",
        nullable: true,
      },
      lane_role: {
        description: "lane_role",
        type: "integer",
        nullable: true,
      },
      is_roaming: {
        description: "Boolean describing whether or not the player roamed",
        type: "boolean",
        nullable: true,
      },
      cluster: {
        description: "cluster",
        type: "integer",
      },
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: "integer",
      },
      party_size: {
        description:
          "Size of the players party. If not in a party, will return 1.",
        type: "integer",
        nullable: true,
      },
    },
  },
  PlayerMatchesResponse: {
    title: "PlayerMatchesResponse",
    description: "Object containing information on the match",
    type: "object",
    properties: {
      match_id: {
        description: "Match ID",
        type: "integer",
      },
      player_slot: {
        description:
          "Which slot the player is in. 0-127 are Radiant, 128-255 are Dire",
        type: "integer",
      },
      radiant_win: {
        description: "Boolean indicating whether Radiant won the match",
        type: "boolean",
      },
      duration: {
        description: "Duration of the game in seconds",
        type: "integer",
      },
      game_mode: {
        description:
          "Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json",
        type: "integer",
      },
      lobby_type: {
        description:
          "Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json",
        type: "integer",
      },
      hero_id: {
        description: "The ID value of the hero played",
        type: "integer",
      },
      start_time: {
        description: "Time the game started in seconds since 1970",
        type: "integer",
      },
      version: {
        description: "version",
        type: "integer",
        nullable: true,
      },
      kills: {
        description: "Total kills the player had at the end of the game",
        type: "integer",
      },
      deaths: {
        description: "Total deaths the player had at the end of the game",
        type: "integer",
      },
      assists: {
        description: "Total assists the player had at the end of the game",
        type: "integer",
      },
      skill: {
        description:
          "Skill bracket assigned by Valve (Normal, High, Very High)",
        type: "integer",
        nullable: true,
      },
      average_rank: {
        description: "Average rank of players with public match data",
        type: "integer",
        nullable: true,
      },
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: "integer",
      },
      party_size: {
        description: "Size of the player's party",
        type: "integer",
        nullable: true,
      },
    },
  },
  PlayerHeroesResponse: {
    title: "PlayerHeroesResponse",
    description: "hero",
    type: "object",
    properties: {
      hero_id: {
        description: "The ID value of the hero played",
        type: "string",
      },
      last_played: {
        description: "last_played",
        type: "integer",
      },
      games: {
        description: "games",
        type: "integer",
      },
      win: {
        description: "win",
        type: "integer",
      },
      with_games: {
        description: "with_games",
        type: "integer",
      },
      with_win: {
        description: "with_win",
        type: "integer",
      },
      against_games: {
        description: "against_games",
        type: "integer",
      },
      against_win: {
        description: "against_win",
        type: "integer",
      },
    },
  },
  PlayerPeersResponse: {
    title: "PlayerPeersResponse",
    type: "object",
    properties: {
      account_id: {
        description: "account_id",
        type: "integer",
      },
      last_played: {
        description: "last_played",
        type: "integer",
      },
      win: {
        description: "win",
        type: "integer",
      },
      games: {
        description: "games",
        type: "integer",
      },
      with_win: {
        description: "with_win",
        type: "integer",
      },
      with_games: {
        description: "with_games",
        type: "integer",
      },
      against_win: {
        description: "against_win",
        type: "integer",
      },
      against_games: {
        description: "against_games",
        type: "integer",
      },
      with_gpm_sum: {
        description: "with_gpm_sum",
        type: "integer",
      },
      with_xpm_sum: {
        description: "with_xpm_sum",
        type: "integer",
      },
      personaname: {
        description: "personaname",
        type: "string",
        nullable: true,
      },
      name: {
        description: "name",
        type: "string",
        nullable: true,
      },
      is_contributor: {
        description: "is_contributor",
        type: "boolean",
      },
      is_subscriber: {
        description: "is_subscriber",
        type: "boolean",
      },
      last_login: {
        description: "last_login",
        type: "string",
        nullable: true,
      },
      avatar: {
        description: "avatar",
        type: "string",
        nullable: true,
      },
      avatarfull: {
        description: "avatarfull",
        type: "string",
        nullable: true,
      },
    },
  },
  PlayerProsResponse: {
    title: "PlayerProsResponse",
    type: "object",
    properties: {
      account_id: {
        description: "account_id",
        type: "integer",
      },
      name: {
        description: "name",
        type: "string",
      },
      country_code: {
        description: "country_code",
        type: "string",
      },
      fantasy_role: {
        description: "fantasy_role",
        type: "integer",
      },
      team_id: {
        description: "team_id",
        type: "integer",
      },
      team_name: {
        description: "team_name",
        type: "string",
        nullable: true,
      },
      team_tag: {
        description: "team_tag",
        type: "string",
        nullable: true,
      },
      is_locked: {
        description: "is_locked",
        type: "boolean",
      },
      is_pro: {
        description: "is_pro",
        type: "boolean",
      },
      locked_until: {
        description: "locked_until",
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
        format: "date-time",
        nullable: true,
      },
      full_history_time: {
        description: "full_history_time",
        type: "string",
        format: "date-time",
        nullable: true,
      },
      cheese: {
        description: "cheese",
        type: "integer",
        nullable: true,
      },
      fh_unavailable: {
        description: "fh_unavailable",
        type: "boolean",
        nullable: true,
      },
      loccountrycode: {
        description: "loccountrycode",
        type: "string",
        nullable: true,
      },
      last_played: {
        description: "last_played",
        type: "integer",
        nullable: true,
      },
      win: {
        description: "win",
        type: "integer",
      },
      games: {
        description: "games",
        type: "integer",
      },
      with_win: {
        description: "with_win",
        type: "integer",
      },
      with_games: {
        description: "with_games",
        type: "integer",
      },
      against_win: {
        description: "against_win",
        type: "integer",
      },
      against_games: {
        description: "against_games",
        type: "integer",
      },
      with_gpm_sum: {
        description: "with_gpm_sum",
        type: "integer",
        nullable: true,
      },
      with_xpm_sum: {
        description: "with_xpm_sum",
        type: "integer",
        nullable: true,
      },
    },
  },
  PlayerTotalsResponse: {
    title: "PlayerTotalsResponse",
    type: "object",
    properties: {
      field: {
        description: "field",
        type: "string",
      },
      n: {
        description: "number",
        type: "integer",
      },
      sum: {
        description: "sum",
        type: "number",
      },
    },
  },
  PlayerCountsResponse: {
    title: "PlayerCountsResponse",
    type: "object",
    properties: {
      leaver_status: {
        description:
          "Integer describing whether or not the player left the game. 0: didn't leave. 1: left safely. 2+: Abandoned",
        type: "object",
      },
      game_mode: {
        description:
          "Integer corresponding to game mode played. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/game_mode.json",
        type: "object",
      },
      lobby_type: {
        description:
          "Integer corresponding to lobby type of match. List of constants can be found here: https://github.com/odota/dotaconstants/blob/master/json/lobby_type.json",
        type: "object",
      },
      lane_role: {
        description: "lane_role",
        type: "object",
      },
      region: {
        description:
          "Integer corresponding to the region the game was played on",
        type: "object",
      },
      patch: {
        description: "patch",
        type: "object",
      },
    },
  },
  PlayerWardMapResponse: {
    title: "PlayerWardMapResponse",
    type: "object",
    properties: {
      obs: {
        description: "obs",
        type: "object",
      },
      sen: {
        description: "sen",
        type: "object",
      },
    },
  },
  PlayerWordCloudResponse: {
    title: "PlayerWordCloudResponse",
    type: "object",
    properties: {
      my_word_counts: {
        description: "my_word_counts",
        type: "object",
      },
      all_word_counts: {
        description: "all_word_counts",
        type: "object",
      },
    },
  },
  PlayerRatingsResponse: {
    title: "PlayerRatingsResponse",
    type: "object",
    properties: {
      account_id: {
        description: "account_id",
        type: "integer",
      },
      match_id: {
        description: "match_id",
        type: "integer",
      },
      solo_competitive_rank: {
        description: "solo_competitive_rank",
        type: "integer",
        nullable: true,
      },
      competitive_rank: {
        description: "competitive_rank",
        type: "integer",
      },
      time: {
        description: "time",
        type: "integer",
      },
    },
  },
};
