/**
 * Gets data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * Approx limits: 100 per account per day, 500 per IP per day
 *
 * Has no third party dependencies. In place of protobufjs, steam-user-odota and
 * steam-session this file includes:
 *  - a small protobuf codec plus the message schemas it needs
 *  - a minimal Steam CM client (websocket only, no friends/chat/apps/etc.)
 *    including the password login flow
 * */
import { EventEmitter } from "node:events";
import {
  constants,
  createHash,
  createPublicKey,
  publicEncrypt,
} from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import { gunzipSync, gzipSync } from "node:zlib";
import config from "../config.ts";

// ---------------------------------------------------------------------------
// Protobuf
// ---------------------------------------------------------------------------

// Message schemas, generated from the .proto files. One entry per message with
// space separated "fieldNumber:name:type" fields (types are scalars, enums or
// other messages; a trailing [] means repeated). Fields we never read or write
// are left out of the Steam messages.
const MESSAGES: Record<string, string> = {
  // Steam client protocol
  CMsgProtoBufHeader: `
    1:steamid:fixed64 2:client_sessionid:int32 3:routing_appid:uint32 10:jobid_source:fixed64
    11:jobid_target:fixed64 12:target_job_name:string 13:eresult:int32 14:error_message:string
    32:realm:uint32
  `,
  CMsgClientHello: `1:protocol_version:uint32`,
  CMsgIPAddress: `1:v4:fixed32`,
  CMsgMulti: `1:size_unzipped:uint32 2:message_body:bytes`,
  CMsgClientLogon: `
    1:protocol_version:uint32 3:cell_id:uint32 4:last_session_id:uint32 6:client_language:string
    7:client_os_type:uint32 8:should_remember_password:bool 11:obfuscated_private_ip:CMsgIPAddress
    30:machine_id:bytes 33:chat_mode:uint32 96:machine_name:string 100:client_instance_id:uint64
    102:supports_rate_limit_response:bool 108:access_token:string
  `,
  CMsgClientLogonResponse: `
    1:eresult:int32 3:heartbeat_seconds:int32 7:cell_id:uint32 15:public_ip:CMsgIPAddress
    20:client_supplied_steamid:fixed64 27:client_instance_id:uint64
  `,
  CMsgClientLoggedOff: `1:eresult:int32`,
  CMsgClientPlayingSessionState: `2:playing_blocked:bool 3:playing_app:uint32`,
  CMsgClientGamesPlayed: `1:games_played:CMsgClientGamesPlayed.GamePlayed[]`,
  "CMsgClientGamesPlayed.GamePlayed": `2:game_id:fixed64`,
  CMsgGCClient: `1:appid:uint32 2:msgtype:uint32 3:payload:bytes`,
  CMsgClientAMGetPersonaNameHistory: `
    1:id_count:int32 2:Ids:CMsgClientAMGetPersonaNameHistory.IdInstance[]
  `,
  "CMsgClientAMGetPersonaNameHistory.IdInstance": `1:steamid:fixed64`,
  CMsgClientAMGetPersonaNameHistoryResponse: `
    2:responses:CMsgClientAMGetPersonaNameHistoryResponse.NameTableInstance[]
  `,
  "CMsgClientAMGetPersonaNameHistoryResponse.NameTableInstance": `
    1:eresult:int32 2:steamid:fixed64
    3:names:CMsgClientAMGetPersonaNameHistoryResponse.NameTableInstance.NameInstance[]
  `,
  "CMsgClientAMGetPersonaNameHistoryResponse.NameTableInstance.NameInstance": `
    1:name_since:fixed32 2:name:string
  `,
  // Steam authentication service
  CAuthentication_GetPasswordRSAPublicKey_Request: `1:account_name:string`,
  CAuthentication_GetPasswordRSAPublicKey_Response: `
    1:publickey_mod:string 2:publickey_exp:string 3:timestamp:uint64
  `,
  CAuthentication_BeginAuthSessionViaCredentials_Request: `
    2:account_name:string 3:encrypted_password:string 4:encryption_timestamp:uint64
    5:remember_login:bool 7:persistence:int32 8:website_id:string
    9:device_details:CAuthentication_DeviceDetails
  `,
  CAuthentication_DeviceDetails: `
    1:device_friendly_name:string 2:platform_type:int32 3:os_type:int32 4:gaming_device_type:uint32
    6:machine_id:bytes
  `,
  CAuthentication_BeginAuthSessionViaCredentials_Response: `
    1:client_id:uint64 2:request_id:bytes 3:interval:float
    4:allowed_confirmations:CAuthentication_AllowedConfirmation[] 5:steamid:uint64
  `,
  CAuthentication_AllowedConfirmation: `1:confirmation_type:int32 2:associated_message:string`,
  CAuthentication_PollAuthSessionStatus_Request: `1:client_id:uint64 2:request_id:bytes`,
  CAuthentication_PollAuthSessionStatus_Response: `1:new_client_id:uint64 3:refresh_token:string`,
  // Dota 2 game coordinator
  CMsgClientToGCGetProfileCard: `
    1:account_id:uint32
  `,
  CMsgDOTAProfileCard: `
    1:account_id:uint32 3:slots:CMsgDOTAProfileCard.Slot[] 4:badge_points:uint32 6:event_id:uint32
    7:recent_battle_cup_victory:CMsgBattleCupVictory 8:rank_tier:uint32 9:leaderboard_rank:uint32
    10:is_plus_subscriber:bool 11:plus_original_start_date:uint32 12:rank_tier_score:uint32
    17:leaderboard_rank_core:uint32 23:title:uint32 24:favorite_team_packed:uint64
    25:lifetime_games:uint32 26:event_level:uint32
  `,
  "CMsgDOTAProfileCard.Slot": `
    1:slot_id:uint32 2:trophy:CMsgDOTAProfileCard.Slot.Trophy 3:stat:CMsgDOTAProfileCard.Slot.Stat
    4:item:CMsgDOTAProfileCard.Slot.Item 5:hero:CMsgDOTAProfileCard.Slot.Hero
    6:emoticon:CMsgDOTAProfileCard.Slot.Emoticon 7:team:CMsgDOTAProfileCard.Slot.Team
  `,
  "CMsgDOTAProfileCard.Slot.Trophy": `
    1:trophy_id:uint32 2:trophy_score:uint32
  `,
  "CMsgDOTAProfileCard.Slot.Stat": `
    1:stat_id:CMsgDOTAProfileCard.EStatID 2:stat_score:uint32
  `,
  "CMsgDOTAProfileCard.Slot.Item": `
    1:serialized_item:bytes 2:item_id:uint64
  `,
  "CMsgDOTAProfileCard.Slot.Hero": `
    1:hero_id:int32 2:hero_wins:uint32 3:hero_losses:uint32
  `,
  "CMsgDOTAProfileCard.Slot.Emoticon": `
    1:emoticon_id:uint32
  `,
  "CMsgDOTAProfileCard.Slot.Team": `
    1:team_id:uint32
  `,
  CMsgBattleCupVictory: `
    1:account_id:uint32 2:win_date:uint32 3:valid_until:uint32 4:skill_level:uint32
    5:tournament_id:uint32 6:division_id:uint32 7:team_id:uint32 8:streak:uint32 9:trophy_id:uint32
  `,
  CMsgGCMatchDetailsRequest: `
    1:match_id:uint64
  `,
  CMsgGCMatchDetailsResponse: `
    1:result:uint32 2:match:CMsgDOTAMatch 3:vote:DOTAMatchVote
  `,
  CMsgDOTAMatch: `
    3:duration:uint32 4:starttime:fixed32 5:players:CMsgDOTAMatch.Player[] 6:match_id:uint64
    8:tower_status:uint32[] 9:barracks_status:uint32[] 10:cluster:uint32 12:first_blood_time:uint32
    13:replay_salt:fixed32 14:server_ip:fixed32 15:server_port:uint32 16:lobby_type:uint32
    17:human_players:uint32 18:average_skill:uint32 19:game_balance:float 20:radiant_team_id:uint32
    21:dire_team_id:uint32 22:leagueid:uint32 23:radiant_team_name:string 24:dire_team_name:string
    25:radiant_team_logo:uint64 26:dire_team_logo:uint64 27:radiant_team_complete:uint32
    28:dire_team_complete:uint32 31:game_mode:DOTA_GameMode 32:picks_bans:CMatchHeroSelectEvent[]
    33:match_seq_num:uint64 34:replay_state:CMsgDOTAMatch.ReplayState 35:radiant_guild_id:uint32
    36:dire_guild_id:uint32 37:radiant_team_tag:string 38:dire_team_tag:string 39:series_id:uint32
    40:series_type:uint32 43:broadcaster_channels:CMsgDOTAMatch.BroadcasterChannel[]
    44:engine:uint32 45:custom_game_data:CMsgDOTAMatch.CustomGameData 46:match_flags:uint32
    47:private_metadata_key:fixed32 48:radiant_team_score:uint32 49:dire_team_score:uint32
    50:match_outcome:EMatchOutcome 51:tournament_id:uint32 52:tournament_round:uint32
    53:pre_game_duration:uint32 54:radiant_team_logo_url:string 55:dire_team_logo_url:string
    57:coaches:CMsgDOTAMatch.Coach[]
  `,
  "CMsgDOTAMatch.Player": `
    1:account_id:uint32 2:player_slot:uint32 3:hero_id:int32 4:item_0:int32 5:item_1:int32
    6:item_2:int32 7:item_3:int32 8:item_4:int32 9:item_5:int32 10:expected_team_contribution:float
    11:scaled_metric:float 12:previous_rank:uint32 13:rank_change:sint32 14:kills:uint32
    15:deaths:uint32 16:assists:uint32 17:leaver_status:uint32 18:gold:uint32 19:last_hits:uint32
    20:denies:uint32 21:gold_per_min:uint32 22:xp_per_min:uint32 23:gold_spent:uint32
    24:hero_damage:uint32 25:tower_damage:uint32 26:hero_healing:uint32 27:level:uint32
    28:time_last_seen:uint32 29:player_name:string 30:support_ability_value:uint32
    32:feeding_detected:bool 34:search_rank:uint32 35:search_rank_uncertainty:uint32
    36:rank_uncertainty_change:int32 37:hero_play_count:uint32 38:party_id:fixed64
    39:scaled_kills:float 40:scaled_deaths:float 41:scaled_assists:float 42:claimed_farm_gold:uint32
    43:support_gold:uint32 44:claimed_denies:uint32 45:claimed_misses:uint32 46:misses:uint32
    47:ability_upgrades:CMatchPlayerAbilityUpgrade[]
    48:additional_units_inventory:CMatchAdditionalUnitInventory[]
    50:custom_game_data:CMsgDOTAMatch.Player.CustomGameData 51:active_plus_subscription:bool
    52:net_worth:uint32 54:scaled_hero_damage:uint32 55:scaled_tower_damage:uint32
    56:scaled_hero_healing:uint32 57:permanent_buffs:CMatchPlayerPermanentBuff[]
    58:bot_difficulty:uint32 59:item_6:int32 60:item_7:int32 61:item_8:int32
    63:hero_pick_order:uint32 64:hero_was_randomed:bool
    67:hero_damage_received:CMsgDOTAMatch.Player.HeroDamageReceived[]
    69:hero_was_dota_plus_suggestion:bool 70:seconds_dead:uint32 71:gold_lost_to_death:uint32
    72:pro_name:string 73:real_name:string 74:mmr_type:uint32 75:lane_selection_flags:uint32
    76:item_9:int32 77:bounty_runes:uint32 78:outposts_captured:uint32
    79:hero_damage_dealt:CMsgDOTAMatch.Player.HeroDamageReceived[] 80:team_number:DOTA_GC_TEAM
    81:team_slot:uint32 82:selected_facet:uint32 83:item_10:int32 84:item_10_lvl:int32
  `,
  CMatchPlayerAbilityUpgrade: `
    1:ability:int32 2:time:uint32
  `,
  CMatchAdditionalUnitInventory: `
    1:unit_name:string 2:items:int32[]
  `,
  CMatchPlayerPermanentBuff: `
    1:permanent_buff:uint32 2:stack_count:uint32 3:grant_time:uint32
  `,
  "CMsgDOTAMatch.Player.CustomGameData": `
    1:dota_team:uint32 2:winner:bool
  `,
  "CMsgDOTAMatch.Player.HeroDamageReceived": `
    1:pre_reduction:uint32 2:post_reduction:uint32 3:damage_type:CMsgDOTAMatch.Player.HeroDamageType
  `,
  CMatchHeroSelectEvent: `
    1:is_pick:bool 2:team:uint32 3:hero_id:int32
  `,
  "CMsgDOTAMatch.BroadcasterChannel": `
    1:country_code:string 2:description:string 3:broadcaster_infos:CMsgDOTAMatch.BroadcasterInfo[]
    4:language_code:string
  `,
  "CMsgDOTAMatch.BroadcasterInfo": `
    1:account_id:uint32 2:name:string
  `,
  "CMsgDOTAMatch.CustomGameData": `
    1:custom_game_id:uint64 2:map_name:string
  `,
  "CMsgDOTAMatch.Coach": `
    1:account_id:uint32 2:coach_name:string 3:coach_rating:uint32 4:coach_team:uint32
    5:coach_party_id:uint64 6:is_private_coach:bool
  `,
};

// Enums, as "value:NAME" pairs. Only needed to turn enum values into names for JSON output.
const ENUMS: Record<string, string> = {
  "CMsgDOTAProfileCard.EStatID": `
    3:k_eStat_Wins 4:k_eStat_Commends 5:k_eStat_GamesPlayed 6:k_eStat_FirstMatchDate
    7:k_eStat_PreviousSeasonRank 8:k_eStat_GamesMVP
  `,
  "CMsgDOTAMatch.Player.HeroDamageType": `
    0:HERO_DAMAGE_PHYSICAL 1:HERO_DAMAGE_MAGICAL 2:HERO_DAMAGE_PURE
  `,
  DOTA_GC_TEAM: `
    0:DOTA_GC_TEAM_GOOD_GUYS 1:DOTA_GC_TEAM_BAD_GUYS 2:DOTA_GC_TEAM_BROADCASTER
    3:DOTA_GC_TEAM_SPECTATOR 4:DOTA_GC_TEAM_PLAYER_POOL 5:DOTA_GC_TEAM_NOTEAM
    6:DOTA_GC_TEAM_CUSTOM_1 7:DOTA_GC_TEAM_CUSTOM_2 8:DOTA_GC_TEAM_CUSTOM_3 9:DOTA_GC_TEAM_CUSTOM_4
    10:DOTA_GC_TEAM_CUSTOM_5 11:DOTA_GC_TEAM_CUSTOM_6 12:DOTA_GC_TEAM_CUSTOM_7
    13:DOTA_GC_TEAM_CUSTOM_8 14:DOTA_GC_TEAM_NEUTRALS
  `,
  DOTA_GameMode: `
    0:DOTA_GAMEMODE_NONE 1:DOTA_GAMEMODE_AP 2:DOTA_GAMEMODE_CM 3:DOTA_GAMEMODE_RD 4:DOTA_GAMEMODE_SD
    5:DOTA_GAMEMODE_AR 6:DOTA_GAMEMODE_INTRO 7:DOTA_GAMEMODE_HW 8:DOTA_GAMEMODE_REVERSE_CM
    9:DOTA_GAMEMODE_XMAS 10:DOTA_GAMEMODE_TUTORIAL 11:DOTA_GAMEMODE_MO 12:DOTA_GAMEMODE_LP
    13:DOTA_GAMEMODE_POOL1 14:DOTA_GAMEMODE_FH 15:DOTA_GAMEMODE_CUSTOM 16:DOTA_GAMEMODE_CD
    17:DOTA_GAMEMODE_BD 18:DOTA_GAMEMODE_ABILITY_DRAFT 19:DOTA_GAMEMODE_EVENT 20:DOTA_GAMEMODE_ARDM
    21:DOTA_GAMEMODE_1V1MID 22:DOTA_GAMEMODE_ALL_DRAFT 23:DOTA_GAMEMODE_TURBO
    24:DOTA_GAMEMODE_MUTATION 25:DOTA_GAMEMODE_COACHES_CHALLENGE 26:DOTA_GAMEMODE_BOT_CHALLENGE
  `,
  "CMsgDOTAMatch.ReplayState": `
    0:REPLAY_AVAILABLE 1:REPLAY_NOT_RECORDED 2:REPLAY_EXPIRED
  `,
  EMatchOutcome: `
    0:k_EMatchOutcome_Unknown 2:k_EMatchOutcome_RadVictory 3:k_EMatchOutcome_DireVictory
    4:k_EMatchOutcome_NeutralVictory 5:k_EMatchOutcome_NoTeamWinner 6:k_EMatchOutcome_Custom1Victory
    7:k_EMatchOutcome_Custom2Victory 8:k_EMatchOutcome_Custom3Victory
    9:k_EMatchOutcome_Custom4Victory 10:k_EMatchOutcome_Custom5Victory
    11:k_EMatchOutcome_Custom6Victory 12:k_EMatchOutcome_Custom7Victory
    13:k_EMatchOutcome_Custom8Victory 64:k_EMatchOutcome_NotScored_PoorNetworkConditions
    65:k_EMatchOutcome_NotScored_Leaver 66:k_EMatchOutcome_NotScored_ServerCrash
    67:k_EMatchOutcome_NotScored_NeverStarted 68:k_EMatchOutcome_NotScored_Canceled
    69:k_EMatchOutcome_NotScored_Suspicious
  `,
  DOTAMatchVote: `
    0:DOTAMatchVote_INVALID 1:DOTAMatchVote_POSITIVE 2:DOTAMatchVote_NEGATIVE
  `,
};

type Msg = Record<string, any>;
type Field = { id: number; name: string; type: string; repeated: boolean };

const schema = new Map<string, Map<number, Field>>();
for (const [name, def] of Object.entries(MESSAGES)) {
  const fields = new Map<number, Field>();
  for (const token of def.trim().split(/\s+/)) {
    const [id, fieldName, rawType] = token.split(":");
    const repeated = rawType.endsWith("[]");
    fields.set(Number(id), {
      id: Number(id),
      name: fieldName,
      type: repeated ? rawType.slice(0, -2) : rawType,
      repeated,
    });
  }
  schema.set(name, fields);
}
const enumNames = new Map<string, Map<number, string>>();
for (const [name, def] of Object.entries(ENUMS)) {
  enumNames.set(
    name,
    new Map(
      def
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const i = pair.indexOf(":");
          return [Number(pair.slice(0, i)), pair.slice(i + 1)];
        }),
    ),
  );
}

// Wire types: 0 varint, 1 64-bit, 2 length-delimited, 5 32-bit
function wireType(type: string): number {
  if (type === "fixed64") return 1;
  if (type === "fixed32" || type === "float") return 5;
  if (type === "string" || type === "bytes" || schema.has(type)) return 2;
  return 0; // ints, bool, enums
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? BigInt(n) : 0n;
}

/**
 * Encodes a message. Only the field types that we send are supported.
 * 64-bit values can be passed as number, bigint or decimal string.
 * */
function encode(type: string, msg: Msg): Buffer {
  const fields = schema.get(type);
  if (!fields) {
    throw new Error(`Unknown message type ${type}`);
  }
  const out: Buffer[] = [];
  const varint = (value: bigint) => {
    const bytes: number[] = [];
    let n = BigInt.asUintN(64, value); // negative numbers are sign extended to 64 bits
    do {
      const byte = Number(n & 0x7fn);
      n >>= 7n;
      bytes.push(n ? byte | 0x80 : byte);
    } while (n);
    out.push(Buffer.from(bytes));
  };
  const bytes = (value: Uint8Array) => {
    varint(BigInt(value.length));
    out.push(Buffer.from(value));
  };
  for (const field of fields.values()) {
    const value = msg[field.name];
    if (value == null) {
      continue;
    }
    for (const item of field.repeated ? (value as unknown[]) : [value]) {
      varint(BigInt((field.id << 3) | wireType(field.type)));
      switch (field.type) {
        case "uint32":
          varint(BigInt.asUintN(32, toBigInt(item)));
          break;
        case "int32":
          varint(BigInt.asIntN(32, toBigInt(item)));
          break;
        case "uint64":
          varint(toBigInt(item));
          break;
        case "bool":
          varint(item ? 1n : 0n);
          break;
        case "fixed32": {
          const b = Buffer.alloc(4);
          b.writeUInt32LE(Number(item) >>> 0);
          out.push(b);
          break;
        }
        case "fixed64": {
          const b = Buffer.alloc(8);
          b.writeBigUInt64LE(BigInt.asUintN(64, toBigInt(item)));
          out.push(b);
          break;
        }
        case "string":
          bytes(Buffer.from(String(item), "utf8"));
          break;
        case "bytes":
          bytes(item as Uint8Array);
          break;
        default:
          if (enumNames.has(field.type)) {
            varint(BigInt.asIntN(32, toBigInt(item)));
          } else {
            bytes(encode(field.type, item));
          }
      }
    }
  }
  return Buffer.concat(out);
}

/**
 * Decodes a message. Only fields present on the wire are set (no defaults).
 * Enums are numbers, 64-bit integers are decimal strings, bytes are Buffers.
 * */
function decode(type: string, buf: Buffer): Msg {
  const fields = schema.get(type);
  if (!fields) {
    throw new Error(`Unknown message type ${type}`);
  }
  const msg: Msg = {};
  let pos = 0;
  const varint = (): bigint => {
    let value = 0n;
    for (let shift = 0n; ; shift += 7n) {
      if (pos >= buf.length) {
        throw new Error("Truncated varint");
      }
      const byte = buf[pos++];
      value |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) {
        return value;
      }
    }
  };
  const take = (n: number): Buffer => {
    if (n < 0 || pos + n > buf.length) {
      throw new Error("Truncated message");
    }
    pos += n;
    return buf.subarray(pos - n, pos);
  };
  const scalar = (t: string): unknown => {
    switch (t) {
      case "uint32":
        return Number(BigInt.asUintN(32, varint()));
      case "int32":
        return Number(BigInt.asIntN(32, varint()));
      case "sint32": {
        const n = Number(BigInt.asUintN(32, varint()));
        return (n >>> 1) ^ -(n & 1);
      }
      case "uint64":
        return BigInt.asUintN(64, varint()).toString();
      case "bool":
        return varint() !== 0n;
      case "fixed32":
        return take(4).readUInt32LE(0);
      case "float":
        return take(4).readFloatLE(0);
      case "fixed64":
        return take(8).readBigUInt64LE(0).toString();
      case "string":
        return take(Number(varint())).toString("utf8");
      case "bytes":
        return Buffer.from(take(Number(varint())));
      default:
        return enumNames.has(t)
          ? Number(BigInt.asIntN(32, varint()))
          : decode(t, take(Number(varint())));
    }
  };
  const skip = (wire: number) => {
    if (wire === 0) varint();
    else if (wire === 1) take(8);
    else if (wire === 2) take(Number(varint()));
    else if (wire === 5) take(4);
    else throw new Error(`Unsupported wire type ${wire}`);
  };
  while (pos < buf.length) {
    const tag = Number(varint());
    const wire = tag & 7;
    const field = fields.get(tag >>> 3);
    if (!field) {
      skip(wire);
      continue;
    }
    const expected = wireType(field.type);
    if (field.repeated) {
      const list: unknown[] = (msg[field.name] ??= []);
      if (wire === 2 && expected !== 2) {
        // packed
        const end = pos + Number(varint());
        while (pos < end) {
          list.push(scalar(field.type));
        }
      } else if (wire === expected) {
        list.push(scalar(field.type));
      } else {
        skip(wire);
      }
    } else if (wire === expected) {
      msg[field.name] = scalar(field.type);
    } else {
      skip(wire);
    }
  }
  return msg;
}

/**
 * Converts a decoded message into the shape used for JSON responses:
 * fields in field number order, enums as names, bytes as base64.
 * */
function toJSON(type: string, msg: Msg): Msg {
  const convert = (t: string, value: any): unknown => {
    if (t === "bytes") {
      return (value as Buffer).toString("base64");
    }
    if (enumNames.has(t)) {
      return enumNames.get(t)!.get(value) ?? value;
    }
    if (schema.has(t)) {
      return toJSON(t, value);
    }
    if (t === "float" && !Number.isFinite(value)) {
      return String(value);
    }
    return value;
  };
  const out: Msg = {};
  for (const field of schema.get(type)!.values()) {
    const value = msg[field.name];
    if (value === undefined || (field.repeated && !value.length)) {
      continue;
    }
    out[field.name] = field.repeated
      ? value.map((v: unknown) => convert(field.type, v))
      : convert(field.type, value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Steam client
// ---------------------------------------------------------------------------

const PROTO_MASK = 0x80000000;
const JOBID_NONE = "18446744073709551615";
const PROTOCOL_VERSION = 65580;
const OS_TYPE_LINUX_UNKNOWN = 4294967093; // EOSType.LinuxUnknown (-203) as uint32

const EMsg = {
  Multi: 1,
  ServiceMethodResponse: 147,
  ClientHeartBeat: 703,
  ClientLogOff: 706,
  ClientLogOnResponse: 751,
  ClientLoggedOff: 757,
  ClientGamesPlayedWithDataBlob: 5410,
  ClientToGC: 5452,
  ClientFromGC: 5453,
  ClientLogon: 5514,
  ServiceMethodCallFromClientNonAuthed: 9804,
  ClientHello: 9805,
  ClientAMGetPersonaNameHistory: 5570,
  ClientAMGetPersonaNameHistoryResponse: 5571,
  ClientPlayingSessionState: 9600,
  ClientKickPlayingSession: 9601,
} as const;

// Result codes (EResult). Only the ones we act on are named, the rest are just for error messages.
const EResult = {
  OK: 1,
  Fail: 2,
  NoConnection: 3,
  ServiceUnavailable: 20,
  TryAnotherCM: 48,
  AccountLogonDenied: 63,
  BadResponse: 76,
  AccountLoginDeniedNeedTwoFactor: 85,
} as const;
const EResultNames = new Map(
  `
    0:Invalid 1:OK 2:Fail 3:NoConnection 5:InvalidPassword 6:LoggedInElsewhere
    7:InvalidProtocolVer 8:InvalidParam 9:FileNotFound 10:Busy 11:InvalidState 12:InvalidName
    13:InvalidEmail 14:DuplicateName 15:AccessDenied 16:Timeout 17:Banned 18:AccountNotFound
    19:InvalidSteamID 20:ServiceUnavailable 21:NotLoggedOn 22:Pending 23:EncryptionFailure
    24:InsufficientPrivilege 25:LimitExceeded 26:Revoked 27:Expired 28:AlreadyRedeemed
    29:DuplicateRequest 30:AlreadyOwned 31:IPNotFound 32:PersistFailed 33:LockingFailed
    34:LogonSessionReplaced 35:ConnectFailed 36:HandshakeFailed 37:IOFailure 38:RemoteDisconnect
    39:ShoppingCartNotFound 40:Blocked 41:Ignored 42:NoMatch 43:AccountDisabled
    44:ServiceReadOnly 45:AccountNotFeatured 46:AdministratorOK 47:ContentVersion
    48:TryAnotherCM 49:PasswordRequiredToKickSession 50:AlreadyLoggedInElsewhere 51:Suspended
    52:Cancelled 53:DataCorruption 54:DiskFull 55:RemoteCallFailed 56:PasswordUnset
    57:ExternalAccountUnlinked 58:PSNTicketInvalid 59:ExternalAccountAlreadyLinked
    60:RemoteFileConflict 61:IllegalPassword 62:SameAsPreviousValue 63:AccountLogonDenied
    64:CannotUseOldPassword 65:InvalidLoginAuthCode 66:AccountLogonDeniedNoMail
    67:HardwareNotCapableOfIPT 68:IPTInitError 69:ParentalControlRestricted
    70:FacebookQueryError 71:ExpiredLoginAuthCode 72:IPLoginRestrictionFailed
    73:AccountLockedDown 74:AccountLogonDeniedVerifiedEmailRequired 75:NoMatchingURL
    76:BadResponse 77:RequirePasswordReEntry 78:ValueOutOfRange 79:UnexpectedError 80:Disabled
    81:InvalidCEGSubmission 82:RestrictedDevice 83:RegionLocked 84:RateLimitExceeded
    85:AccountLoginDeniedNeedTwoFactor 86:ItemDeleted 87:AccountLoginDeniedThrottle
    88:TwoFactorCodeMismatch 89:TwoFactorActivationCodeMismatch
    90:AccountAssociatedToMultiplePartners 91:NotModified 92:NoMobileDevice 93:TimeNotSynced
    94:SMSCodeFailed 95:AccountLimitExceeded 96:AccountActivityLimitExceeded
    97:PhoneActivityLimitExceeded 98:RefundToWallet 99:EmailSendFailure 100:NotSettled
    101:NeedCaptcha 102:GSLTDenied 103:GSOwnerDenied 104:InvalidItemType 105:IPBanned
    106:GSLTExpired 107:InsufficientFunds 108:TooManyPending 109:NoSiteLicensesFound
    110:WGNetworkSendExceeded 111:AccountNotFriends 112:LimitedUserAccount 113:CantRemoveItem
    114:AccountDeleted 115:ExistingUserCancelledLicense 116:CommunityCooldown
    117:NoLauncherSpecified 118:MustAgreeToSSA 119:LauncherMigrated 120:SteamRealmMismatch
    121:InvalidSignature 122:ParseFailure 123:NoVerifiedPhone 124:InsufficientBattery
    125:ChargerRequired 126:CachedCredentialInvalid 127:PhoneNumberIsVOIP
  `
    .trim()
    .split(/\s+/)
    .map((pair) => [Number(pair.split(":")[0]), pair.split(":")[1]] as const),
);
const eresultName = (eresult: number) =>
  EResultNames.get(eresult) ?? String(eresult);

// Steam Guard confirmation types (EAuthSessionGuardType)
const GUARD_NONE = 1;
const GUARD_EMAIL_CODE = 2;

// These logoffs are temporary, so we reconnect. Anything else is fatal.
const NON_FATAL_LOGOFF = [
  0,
  EResult.Fail,
  EResult.NoConnection,
  EResult.ServiceUnavailable,
  EResult.TryAnotherCM,
];

type GCCallback = (appid: number, msgType: number, payload: Buffer) => void;

function eresultError(eresult: number) {
  return Object.assign(new Error(eresultName(eresult)), { eresult });
}

// Steam wants a binary KV "machine ID". Derive a stable one from the account name.
function createMachineID(accountName: string): Buffer {
  const hash = (kind: string) =>
    createHash("sha1")
      .update(`SteamUser Hash ${kind} ${accountName}`)
      .digest("hex");
  const cstr = (s: string) => Buffer.from(s + "\0");
  const entry = (key: string) =>
    Buffer.concat([Buffer.from([1]), cstr(key), cstr(hash(key))]);
  return Buffer.concat([
    Buffer.from([0]),
    cstr("MessageObject"),
    entry("BB3"),
    entry("FF2"),
    entry("3B3"),
    Buffer.from([8, 8]),
  ]);
}

// A plausible Windows hostname derived from ours, which Steam shows as the name of the device logging in
function spoofedHostname(): string {
  const hash = createHash("sha1").update(os.hostname()).digest();
  let name = "DESKTOP-";
  for (let i = 0; i < 7; i++) {
    name += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[hash[i] % 26];
  }
  return name;
}

/**
 * Minimal Steam client: logs in over a CM websocket, keeps the connection
 * alive and reconnects, and talks to a game coordinator.
 *
 * Events:
 * - loggedOn
 * - appLaunched (appid)
 * - receivedFromGC (appid, msgType, payload)
 * - error (err with .eresult)
 * */
class SteamClient extends EventEmitter {
  steamID: string | null = null;
  publicIP = "";
  private account?: { accountName: string; password: string };
  private machineID: Buffer = Buffer.alloc(0);
  private refreshToken = "";
  private authSteamID = "0";
  private ws: WebSocket | null = null;
  private server = "";
  private connecting = false;
  private connectTimeout = 1000;
  private cmListAttempts = 0;
  private backoff = 0;
  private badServers = new Map<string, number>();
  private sessionID = 0;
  private lastSessionID?: number;
  private cellID?: number;
  private clientInstanceID?: string;
  private jobID = 0;
  private gcJobID = 0;
  private jobs = new Map<string, (body: Buffer, header: Msg) => void>();
  private gcJobs = new Map<string, GCCallback>();
  private playingBlocked = false;
  private playingApps: number[] = [];
  private heartbeatTimer?: NodeJS.Timeout;
  private logonTimer?: NodeJS.Timeout;
  private connectTimer?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;

  logOn(account: { accountName: string; password: string }) {
    this.account = account;
    this.machineID = createMachineID(account.accountName);
    process.nextTick(() => this.connect());
  }

  /** Reconnects, e.g. when the GC isn't responding. */
  relog() {
    if (!this.steamID) {
      return; // already disconnected and reconnecting
    }
    this.send(EMsg.ClientLogOff, Buffer.alloc(0));
    this.disconnect();
    this.retry(1000);
  }

  /** Sends a protobuf message to a GC. If a callback is passed, it receives the matching response. */
  sendToGC(
    appid: number,
    msgType: number,
    payload: Buffer,
    callback?: GCCallback,
  ) {
    let jobID = JOBID_NONE;
    if (callback) {
      jobID = String(++this.gcJobID);
      this.gcJobs.set(jobID, callback);
      setTimeout(() => this.gcJobs.delete(jobID), 120000).unref();
    }
    const gcHeader = encode("CMsgProtoBufHeader", { jobid_source: jobID });
    const prefix = Buffer.alloc(8);
    const gcMsgType = (msgType | PROTO_MASK) >>> 0;
    prefix.writeUInt32LE(gcMsgType, 0);
    prefix.writeInt32LE(gcHeader.length, 4);
    this.send(
      EMsg.ClientToGC,
      encode("CMsgGCClient", {
        appid,
        msgtype: gcMsgType,
        payload: Buffer.concat([prefix, gcHeader, payload]),
      }),
      JOBID_NONE,
      appid,
    );
  }

  /** Tells Steam we're playing a game, which is required to talk to its GC. */
  async gamesPlayed(appid: number, force = false) {
    try {
      if (this.playingBlocked && force) {
        await this.kickPlayingSession();
      }
    } catch {
      return;
    }
    this.send(
      EMsg.ClientGamesPlayedWithDataBlob,
      encode("CMsgClientGamesPlayed", { games_played: [{ game_id: appid }] }),
    );
    if (!this.playingApps.includes(appid)) {
      this.emit("appLaunched", appid);
    }
    this.playingApps = [appid];
  }

  /** Fetches past persona names for a list of 64-bit SteamIDs, keyed by SteamID. */
  getAliases(
    steamIDs: string[] | undefined,
    callback: (
      err: Error | null,
      aliases?: Record<string, { name_since: Date; name: string | null }[]>,
    ) => void,
  ) {
    if (!steamIDs?.length || steamIDs.some((id) => !/^\d{1,20}$/.test(id))) {
      return callback(new Error("Invalid SteamID"));
    }
    const jobID = String(++this.jobID);
    const timer = setTimeout(() => {
      this.jobs.delete(jobID);
      callback(new Error("Request timed out"));
    }, 10000);
    this.jobs.set(jobID, (body) => {
      clearTimeout(timer);
      this.jobs.delete(jobID);
      const aliases: Record<string, any> = {};
      const response = decode("CMsgClientAMGetPersonaNameHistoryResponse", body);
      for (const user of response.responses ?? []) {
        if ((user.eresult ?? 0) !== EResult.OK) {
          return callback(eresultError(user.eresult ?? 0));
        }
        aliases[user.steamid] = (user.names ?? []).map((n: Msg) => ({
          name_since: new Date((n.name_since ?? 0) * 1000),
          name: n.name ?? null,
        }));
      }
      callback(null, aliases);
    });
    this.send(
      EMsg.ClientAMGetPersonaNameHistory,
      encode("CMsgClientAMGetPersonaNameHistory", {
        id_count: steamIDs.length,
        Ids: steamIDs.map((steamid) => ({ steamid })),
      }),
      jobID,
    );
  }

  private kickPlayingSession() {
    return new Promise<void>((resolve, reject) => {
      const onState = (blocked: boolean) => {
        clearTimeout(timer);
        if (blocked) {
          reject(new Error("Cannot kick other session"));
        } else {
          resolve();
        }
      };
      const timer = setTimeout(() => {
        this.off("playingState", onState);
        reject(new Error("Request timed out"));
      }, 10000);
      this.once("playingState", onState);
      this.send(EMsg.ClientKickPlayingSession, Buffer.alloc(0));
    });
  }

  // --- Connecting ---

  private retry(delay: number) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  // Exponential backoff for failed logon attempts: 1s up to 60s
  private retryWithBackoff() {
    this.backoff = Math.min(Math.max(this.backoff * 2, 1000), 60000);
    this.retry(this.backoff);
  }

  private connect() {
    this.attemptConnect().catch((e) => {
      console.error(e);
      this.disconnect();
      this.retryWithBackoff();
    });
  }

  private async attemptConnect() {
    if (this.connecting || this.steamID || !this.account) {
      return;
    }
    this.connecting = true;
    let server: string;
    try {
      server = await this.pickServer();
    } catch (e) {
      this.connecting = false;
      if (++this.cmListAttempts >= 10) {
        this.cmListAttempts = 0;
        this.emit("error", e);
      } else {
        this.retry(1000);
      }
      return;
    }
    this.cmListAttempts = 0;
    const ws = new WebSocket(`wss://${server}/cmsocket/`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.server = server;
    this.connectTimer = setTimeout(() => {
      // Never connected, so try another server with a longer timeout
      this.connectTimeout = Math.min(this.connectTimeout * 2, 10000);
      this.disconnect();
      this.connect();
    }, this.connectTimeout);
    ws.addEventListener("open", () => {
      if (ws === this.ws) {
        clearTimeout(this.connectTimer);
        if (this.refreshToken) {
          this.sendLogOn();
        } else {
          void this.authenticate(ws);
        }
      }
    });
    ws.addEventListener("message", (event) => {
      if (ws !== this.ws) {
        return;
      }
      try {
        this.handleMessage(Buffer.from(event.data as ArrayBuffer));
      } catch (e) {
        console.error(e);
      }
    });
    ws.addEventListener("close", () => this.handleClose(ws));
  }

  /**
   * Logs in with the password to get a refresh token, which is what the CM accepts for logon.
   * This is Steam's auth service, called over the CM connection.
   * */
  private async authenticate(ws: WebSocket) {
    try {
      const result = await this.getRefreshToken();
      if (ws !== this.ws) {
        return; // connection was dropped in the meantime
      }
      if ("refreshToken" in result) {
        this.refreshToken = result.refreshToken;
        this.authSteamID = result.steamID;
        this.sendLogOn();
      } else {
        this.handleLogOnFailure(result.eresult);
      }
    } catch (e: any) {
      if (ws === this.ws) {
        this.handleLogOnFailure(e?.eresult || EResult.ServiceUnavailable);
      }
    }
  }

  private async getRefreshToken(): Promise<
    | { refreshToken: string; steamID: string }
    | { eresult: number }
  > {
    const { accountName, password } = this.account!;
    this.send(
      EMsg.ClientHello,
      encode("CMsgClientHello", { protocol_version: PROTOCOL_VERSION }),
    );
    // The password is encrypted with an RSA key that Steam gives us
    const rsa = decode(
      "CAuthentication_GetPasswordRSAPublicKey_Response",
      await this.callService(
        "GetPasswordRSAPublicKey",
        encode("CAuthentication_GetPasswordRSAPublicKey_Request", {
          account_name: accountName,
        }),
      ),
    );
    const hexToBase64Url = (hex: string) =>
      Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex").toString(
        "base64url",
      );
    const encryptedPassword = publicEncrypt(
      {
        key: createPublicKey({
          key: {
            kty: "RSA",
            n: hexToBase64Url(rsa.publickey_mod),
            e: hexToBase64Url(rsa.publickey_exp),
          },
          format: "jwk",
        }),
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(password),
    ).toString("base64");
    const session = decode(
      "CAuthentication_BeginAuthSessionViaCredentials_Response",
      await this.callService(
        "BeginAuthSessionViaCredentials",
        encode("CAuthentication_BeginAuthSessionViaCredentials_Request", {
          account_name: accountName,
          encrypted_password: encryptedPassword,
          encryption_timestamp: rsa.timestamp,
          remember_login: true,
          persistence: 1, // ESessionPersistence.Persistent
          website_id: "Unknown",
          device_details: {
            device_friendly_name: spoofedHostname(),
            platform_type: 1, // EAuthTokenPlatformType.SteamClient
            os_type: 20, // EOSType.Win11
            gaming_device_type: 1,
            machine_id: this.machineID,
          },
        }),
      ),
    );
    let clientID: string = session.client_id;
    const confirmations: Msg[] = session.allowed_confirmations ?? [];
    const has = (type: number) =>
      confirmations.some((c) => c.confirmation_type === type);
    if (!has(GUARD_NONE)) {
      // Steam Guard needs a code or an approval, which we don't support
      return {
        eresult: has(GUARD_EMAIL_CODE)
          ? EResult.AccountLogonDenied
          : EResult.AccountLoginDeniedNeedTwoFactor,
      };
    }
    // Wait for the login to complete
    const start = Date.now();
    try {
      while (Date.now() - start < 30000) {
        const poll = decode(
          "CAuthentication_PollAuthSessionStatus_Response",
          await this.callService(
            "PollAuthSessionStatus",
            encode("CAuthentication_PollAuthSessionStatus_Request", {
              client_id: clientID,
              request_id: session.request_id,
            }),
          ),
        );
        clientID = poll.new_client_id ?? clientID;
        if (poll.refresh_token) {
          return { refreshToken: poll.refresh_token, steamID: session.steamid };
        }
        await new Promise((resolve) =>
          setTimeout(resolve, (session.interval || 5) * 1000),
        );
      }
    } catch {}
    // Timed out, or a problem talking to Steam
    return { eresult: EResult.ServiceUnavailable };
  }

  /** Calls a method of Steam's Authentication service, resolving with the response body. */
  private callService(method: string, request: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const jobID = String(++this.jobID);
      const timer = setTimeout(() => {
        this.jobs.delete(jobID);
        reject(eresultError(EResult.ServiceUnavailable));
      }, 10000);
      this.jobs.set(jobID, (body, header) => {
        clearTimeout(timer);
        this.jobs.delete(jobID);
        const eresult = header.eresult ?? EResult.Fail;
        if (eresult === EResult.OK) {
          resolve(body);
        } else {
          reject(
            Object.assign(new Error(header.error_message || eresultName(eresult)), {
              eresult,
            }),
          );
        }
      });
      this.send(
        EMsg.ServiceMethodCallFromClientNonAuthed,
        request,
        jobID,
        undefined,
        { target_job_name: `Authentication.${method}#1`, realm: 1 },
      );
    });
  }

  private async pickServer(): Promise<string> {
    const resp = await fetch(
      `https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=${this.cellID ?? 0}&cmtype=websockets`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) {
      throw new Error(`GetCMListForConnect failed: ${resp.status}`);
    }
    const json: any = await resp.json();
    const list = json?.response?.serverlist;
    let servers: { endpoint: string; wtd_load: number }[] = (
      Array.isArray(list) ? list : Object.values(list ?? {})
    ).filter((s: any) => s.type === "websockets" && s.realm === "steamglobal");
    if (!servers.length) {
      throw new Error("No Steam servers available");
    }
    // Skip servers that recently dropped us before logging in, unless that's all of them
    const usable = servers.filter(
      (s) => (this.badServers.get(s.endpoint) ?? 0) < Date.now(),
    );
    if (usable.length) {
      servers = usable;
    } else {
      this.badServers.clear();
    }
    // Pick randomly from the 5 least loaded
    servers.sort((a, b) => Number(a.wtd_load) - Number(b.wtd_load));
    const candidates = servers.slice(0, 5);
    return candidates[Math.floor(Math.random() * candidates.length)].endpoint;
  }

  private sendLogOn() {
    // Sometimes Steam never responds to the logon message
    this.logonTimer = setTimeout(() => {
      this.disconnect();
      this.retryWithBackoff();
    }, 5000);
    this.send(
      EMsg.ClientLogon,
      encode("CMsgClientLogon", {
        protocol_version: PROTOCOL_VERSION,
        cell_id: this.cellID,
        last_session_id: this.lastSessionID,
        client_language: "english",
        client_os_type: OS_TYPE_LINUX_UNKNOWN,
        should_remember_password: true,
        obfuscated_private_ip: { v4: 0 },
        machine_id: this.machineID,
        chat_mode: 2, // new chat
        machine_name: "",
        client_instance_id: this.clientInstanceID,
        supports_rate_limit_response: true,
        access_token: this.refreshToken,
      }),
    );
  }

  /** Drops the current connection without reconnecting. */
  private disconnect() {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.logonTimer);
    clearTimeout(this.connectTimer);
    const ws = this.ws;
    this.ws = null; // events from the old socket are ignored from here on
    this.steamID = null;
    this.sessionID = 0;
    this.connecting = false;
    this.playingBlocked = false;
    this.playingApps = [];
    try {
      ws?.close();
    } catch {}
  }

  private handleClose(ws: WebSocket) {
    if (ws !== this.ws) {
      return;
    }
    const wasLoggedOn = this.steamID !== null;
    const server = this.server;
    this.disconnect();
    if (!wasLoggedOn) {
      // Avoid this server for a couple of minutes
      this.badServers.set(server, Date.now() + 120000);
    }
    this.retry(1000);
  }

  // --- Messages ---

  private send(
    emsg: number,
    body: Buffer,
    jobID = JOBID_NONE,
    routingAppID?: number,
    extraHeader: Msg = {},
  ) {
    // Messages sent before we're logged on
    const unauthed =
      emsg === EMsg.ClientHello ||
      emsg === EMsg.ServiceMethodCallFromClientNonAuthed;
    if (!this.ws || (!this.steamID && !unauthed && emsg !== EMsg.ClientLogon)) {
      return; // not logged on
    }
    const header = encode("CMsgProtoBufHeader", {
      steamid: unauthed ? "0" : (this.steamID ?? this.authSteamID),
      client_sessionid: unauthed ? 0 : this.sessionID,
      routing_appid: routingAppID,
      jobid_source: jobID,
      jobid_target: JOBID_NONE,
      ...extraHeader,
    });
    const prefix = Buffer.alloc(8);
    prefix.writeUInt32LE((emsg | PROTO_MASK) >>> 0, 0);
    prefix.writeUInt32LE(header.length, 4);
    try {
      this.ws.send(Buffer.concat([prefix, header, body]));
    } catch {
      this.handleClose(this.ws);
    }
  }

  private handleMessage(buf: Buffer) {
    const rawEMsg = buf.readUInt32LE(0);
    if (!(rawEMsg & PROTO_MASK)) {
      return; // we don't need any of the non-protobuf messages
    }
    const emsg = rawEMsg & ~PROTO_MASK;
    const headerLength = buf.readUInt32LE(4);
    const header = decode(
      "CMsgProtoBufHeader",
      buf.subarray(8, 8 + headerLength),
    );
    const body = buf.subarray(8 + headerLength);
    if (header.client_sessionid && header.steamid && header.steamid !== "0") {
      this.sessionID = header.client_sessionid;
      this.steamID = header.steamid;
    }
    switch (emsg) {
      case EMsg.Multi:
        return this.handleMulti(decode("CMsgMulti", body));
      case EMsg.ClientLogOnResponse:
        return this.handleLogOnResponse(
          decode("CMsgClientLogonResponse", body),
        );
      case EMsg.ClientLoggedOff:
        return this.handleLoggedOff(
          decode("CMsgClientLoggedOff", body).eresult ?? EResult.Fail,
        );
      case EMsg.ClientPlayingSessionState: {
        const state = decode("CMsgClientPlayingSessionState", body);
        this.playingBlocked = Boolean(state.playing_blocked);
        this.emit("playingState", this.playingBlocked, state.playing_app ?? 0);
        return;
      }
      case EMsg.ClientAMGetPersonaNameHistoryResponse:
      case EMsg.ServiceMethodResponse:
        return this.jobs.get(header.jobid_target ?? JOBID_NONE)?.(body, header);
      case EMsg.ClientFromGC:
        return this.handleGCMessage(decode("CMsgGCClient", body));
    }
  }

  // Steam bundles messages together, usually gzipped
  private handleMulti(multi: Msg) {
    let payload: Buffer = multi.message_body ?? Buffer.alloc(0);
    try {
      if (multi.size_unzipped) {
        payload = gunzipSync(payload);
      }
    } catch (e) {
      this.disconnect();
      this.emit("error", e);
      return;
    }
    while (payload.length && this.ws) {
      const size = payload.readUInt32LE(0);
      this.handleMessage(payload.subarray(4, 4 + size));
      payload = payload.subarray(4 + size);
    }
  }

  private handleGCMessage(msg: Msg) {
    const msgType = (msg.msgtype ?? 0) & ~PROTO_MASK;
    const data: Buffer = msg.payload ?? Buffer.alloc(0);
    let targetJobID = JOBID_NONE;
    let payload: Buffer;
    if (((msg.msgtype ?? 0) & PROTO_MASK) !== 0) {
      const headerLength = data.readInt32LE(4);
      const header = decode(
        "CMsgProtoBufHeader",
        data.subarray(8, 8 + headerLength),
      );
      targetJobID = header.jobid_target ?? JOBID_NONE;
      payload = data.subarray(8 + headerLength);
    } else {
      // Old style header: 2 byte version, 8 byte target job, 8 byte source job
      targetJobID = data.readBigUInt64LE(2).toString();
      payload = data.subarray(18);
    }
    const callback = this.gcJobs.get(targetJobID);
    if (callback) {
      this.gcJobs.delete(targetJobID);
      callback(msg.appid ?? 0, msgType, payload);
    } else {
      this.emit("receivedFromGC", msg.appid ?? 0, msgType, payload);
    }
  }

  private handleLogOnResponse(body: Msg) {
    clearTimeout(this.logonTimer);
    const eresult = body.eresult ?? EResult.Fail;
    if (eresult !== EResult.OK) {
      return this.handleLogOnFailure(eresult);
    }
    this.steamID ??= body.client_supplied_steamid ?? null;
    if (!this.steamID) {
      this.disconnect();
      this.emit("error", eresultError(EResult.BadResponse));
      return;
    }
    this.connecting = false;
    this.backoff = 0;
    this.connectTimeout = 1000;
    // Remember these for the next logon
    this.cellID = body.cell_id;
    this.lastSessionID = this.sessionID;
    this.clientInstanceID = body.client_instance_id;
    const ip = body.public_ip?.v4;
    this.publicIP = ip
      ? Array.from(Buffer.from([ip >>> 24, ip >>> 16, ip >>> 8, ip])).join(".")
      : "";
    this.heartbeatTimer = setInterval(
      () => this.send(EMsg.ClientHeartBeat, Buffer.alloc(0)),
      (body.heartbeat_seconds || 9) * 1000,
    );
    this.emit("loggedOn", body);
  }

  private handleLogOnFailure(eresult: number) {
    clearTimeout(this.logonTimer);
    this.disconnect();
    switch (eresult) {
      case EResult.Fail:
      case EResult.ServiceUnavailable:
      case EResult.TryAnotherCM:
        this.retryWithBackoff();
        break;
      default:
        this.backoff = 0;
        this.emit("error", eresultError(eresult));
    }
  }

  private handleLoggedOff(eresult: number) {
    this.disconnect();
    if (NON_FATAL_LOGOFF.includes(eresult)) {
      this.retry(1000);
    } else {
      this.emit("error", eresultError(eresult));
    }
  }
}

// ---------------------------------------------------------------------------
// Retriever service
// ---------------------------------------------------------------------------

const clientMap = new Map<string, SteamClient>();
const matchAttempts = new Map<string, number>();
const failedLogin = new Map<string, string>();

const numAccounts = Number(config.RETRIEVER_NUM_ACCOUNTS);
const matchesPerAccount = 100;
const matchRequestInterval = Math.max(1000 / numAccounts, 250);
const port = config.PORT || config.RETRIEVER_PORT;
const noneReady = () => clientMap.size === 0;
let lastMatchRequestTime: number | null = null;
let matchRequests = 0;
let matchSuccesses = 0;
let profileRequests = 0;
let profileSuccesses = 0;
let aliasRequests = 0;
let aliasSuccesses = 0;
const DOTA_APPID = 570;
let publicIP = "";

// GC message ids (EGCBaseClientMsg, EDOTAGCMsg)
const k_EMsgGCClientHello = 4006;
const k_EMsgGCClientWelcome = 4004;
const k_EMsgClientToGCGetProfileCard = 7534;
const k_EMsgGCMatchDetailsRequest = 7095;

setInterval(() => {
  const shouldRestart =
    matchRequests >= clientMap.size * matchesPerAccount ||
    profileRequests - profileSuccesses > 100000 ||
    noneReady();
  if (config.NODE_ENV !== "development" && shouldRestart && getUptime() > 60) {
    return selfDestruct();
  }
  // Re-register ourselves as available
  if (config.SERVICE_REGISTRY_HOST && !noneReady()) {
    const registerUrl = `https://${config.SERVICE_REGISTRY_HOST}/register/retriever/${publicIP}?key=${config.RETRIEVER_SECRET}`;
    console.log("registerUrl: %s", registerUrl);
    fetch(registerUrl, { method: "POST" });
  }
}, 5000);

const server = createServer(async (req, res) => {
  try {
    const url = new URL("http://localhost" + (req.url || "/"));
    if (url.pathname === "/") {
      const data = {
        matchRequests,
        matchSuccesses,
        // profileRequests,
        // profileSuccesses,
        uptime: getUptime(),
        osUptime: getOSUptime(),
        hostname: os.hostname(),
        numReadyAccounts: clientMap.size,
        failedLogin,
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    } else if (url.pathname === "/healthz") {
      res.end("ok");
    } else {
      if (
        config.RETRIEVER_SECRET &&
        config.RETRIEVER_SECRET !== url.searchParams.get("key")
      ) {
        // reject request if it doesn't have key
        res.statusCode = 403;
        res.end("invalid key");
        return;
      }
      if (noneReady()) {
        res.statusCode = 500;
        res.end("not ready");
        return;
      }
      console.log(
        "numReady: %s, matches: %s/%s, profiles: %s/%s, aliases: %s/%s, uptime: %s, matchRequestDelay: %s",
        clientMap.size,
        matchSuccesses,
        matchRequests,
        profileSuccesses,
        profileRequests,
        aliasSuccesses,
        aliasRequests,
        getUptime(),
        matchRequestInterval,
      );
      if (url.pathname.startsWith("/profile")) {
        const accountId = url.pathname.split("/")[2];
        const keys = Array.from(clientMap.keys());
        const rKey = keys[Math.floor(Math.random() * keys.length)];
        const client = clientMap.get(rKey)!;
        profileRequests += 1;
        client.sendToGC(
          DOTA_APPID,
          k_EMsgClientToGCGetProfileCard,
          encode("CMsgClientToGCGetProfileCard", {
            account_id: Number(accountId),
          }),
          (appid, msgType, payload) => {
            // console.log(appid, msgType, payload);
            profileSuccesses += 1;
            const profileCard = decode("CMsgDOTAProfileCard", payload);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(toJSON("CMsgDOTAProfileCard", profileCard)));
          },
        );
      } else if (url.pathname.startsWith("/match")) {
        // Don't allow requests coming in too fast
        const curTime = Date.now();
        if (
          lastMatchRequestTime &&
          curTime - lastMatchRequestTime < matchRequestInterval
        ) {
          res.statusCode = 429;
          res.end("too many requests");
          return;
        }
        lastMatchRequestTime = curTime;
        const keys = Array.from(clientMap.keys());
        // Round robin request to spread load evenly
        const rKey = keys[matchRequests % keys.length];
        const matchId = url.pathname.split("/")[2];
        const client = clientMap.get(rKey)!;
        matchRequests += 1;
        // If the selected client has multiple consecutive failures, skip the request
        // if ((matchAttempts.get(rKey) ?? 0) >= accountAttemptMax) {
        //   res.statusCode = 500;
        //   res.end("too many attempts");
        //   return;
        // }
        res.setHeader("x-match-request-steamid", rKey);
        res.setHeader("x-match-request-ip", publicIP);
        matchAttempts.set(rKey, (matchAttempts.get(rKey) ?? 0) + 1);
        const start = Date.now();
        const timeout = setTimeout(() => {
          // Respond to send back header info even if no response from GC
          // Use a 204 status code to avoid exception, we'll check the response body after and read headers
          res.statusCode = 204;
          res.end();
        }, 4000);
        client.sendToGC(
          DOTA_APPID,
          k_EMsgGCMatchDetailsRequest,
          encode("CMsgGCMatchDetailsRequest", {
            match_id: Number(matchId),
          }),
          (appid, msgType, payload) => {
            clearTimeout(timeout);
            // Check if we already sent the response to avoid double-sending on slow requests
            if (!res.headersSent) {
              const end = Date.now();
              console.log("match %s: %dms", matchId, end - start);
              const matchData = decode("CMsgGCMatchDetailsResponse", payload);
              // Community prediction match or other reason valve is blocking
              const isBlockedByValve = matchData.result === 15;
              const isExtremelyOldMatch =
                // DOTA_GAMEMODE_NONE, the original response is a number even though the returned response is a string after JSON.stringify()
                !!matchData.match &&
                (matchData.match.game_mode ?? 0) === 0 &&
                (matchData.match.replay_salt ?? 0) === 0;
              const isMatchNotFound = matchData.result === 2;
              if (isBlockedByValve || isExtremelyOldMatch || isMatchNotFound) {
                let reason = "";
                if (isBlockedByValve) {
                  reason =
                    "Blocked by Valve (maybe community prediction match)";
                } else if (isExtremelyOldMatch) {
                  reason =
                    "Extremely old GC response format without replay salt";
                } else if (isMatchNotFound) {
                  reason = "Match ID not found";
                }
                // Send back 204 success with a specific header that tells us not to retry
                console.log(
                  "match %s: non-retryable reason: %s",
                  matchId,
                  reason,
                );
                res.setHeader("x-match-noretry", matchData.result ?? 0);
                res.setHeader("x-noretry-reason", reason);
                res.statusCode = 204;
                res.end();
                return;
              }
              matchSuccesses += 1;
              // Reset on success
              matchAttempts.delete(rKey);
              // Compress and send
              res.setHeader("Content-Encoding", "gzip");
              res.end(
                gzipSync(
                  JSON.stringify(toJSON("CMsgGCMatchDetailsResponse", matchData)),
                ),
              );
            }
          },
        );
      } else if (url.pathname.startsWith("/aliases")) {
        // example: 76561198048632981
        const keys = Array.from(clientMap.keys());
        const rKey = keys[Math.floor(Math.random() * keys.length)];
        const client = clientMap.get(rKey)!;
        aliasRequests += 1;
        client.getAliases(
          url.pathname.split("/")[2]?.split(","),
          (err, aliases) => {
            if (err) {
              res.statusCode = 500;
              res.end(err.message || err);
              return;
            }
            aliasSuccesses += 1;
            res.setHeader("Content-Encoding", "gzip");
            res.end(gzipSync(JSON.stringify(aliases)));
          },
        );
      } else {
        res.statusCode = 404;
        res.end("not found");
      }
    }
  } catch (e) {
    console.log(e);
    res.statusCode = 500;
    res.end("error");
  }
});
server.listen(port, () => {
  console.log("[RETRIEVER] listening on %s", port);
});

let logOns: { accountName: string; password: string }[] | null = null;
if (config.SERVICE_REGISTRY_HOST) {
  // Fetch logons from remote
  while (!logOns?.length) {
    const logOnUrl =
      "https://" +
      config.SERVICE_REGISTRY_HOST +
      "/retrieverData?key=" +
      config.RETRIEVER_SECRET +
      "&count=" +
      numAccounts;
    console.log("logOnUrl: %s", logOnUrl);
    const resp = await fetch(logOnUrl);
    if (resp.ok) {
      logOns = await resp.json();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} else {
  // Generate logons from config
  let users = config.STEAM_USER.split(",");
  let passes = config.STEAM_PASS.split(",");
  logOns = users.map((u, i) => ({
    accountName: u,
    password: passes[i],
  }));
}
// Some logins may fail, and sometimes the Steam CM never returns a response
// So don't block on successful login and we'll just make sure we have at least one working with noneReady
logOns.forEach((logOnDetails) => {
  const client = new SteamClient();
  let relogTimeout: NodeJS.Timeout | undefined;
  client.on("loggedOn", () => {
    console.log("%s: loggedOn", logOnDetails.accountName);
    // Get our public IP from Steam
    publicIP = client.publicIP;
    // Launch Dota 2
    client.gamesPlayed(DOTA_APPID, true);
    relogTimeout = setTimeout(() => {
      // Relog if we don't successfully finish connecting
      console.log("%s: relogging", logOnDetails.accountName);
      client.relog();
    }, 5000);
  });
  client.on("appLaunched", (appid) => {
    client.sendToGC(
      appid,
      k_EMsgGCClientHello,
      Buffer.alloc(0),
    );
  });
  client.on("receivedFromGC", (appid, msgType, payload) => {
    // We'll get Hello response here
    console.log(
      `${logOnDetails.accountName}: Received message ${msgType} from GC ${appid} with ${payload.length} bytes`,
    );
    if (msgType === k_EMsgGCClientWelcome) {
      if (!client.steamID) {
        console.log("%s: client not connected", logOnDetails.accountName);
        return;
      }
      clearTimeout(relogTimeout);
      console.log(
        "%s: ready",
        logOnDetails.accountName,
        // client.steamID.toString(),
      );
      clientMap.set(logOnDetails.accountName, client);
    }
    // We can also handle other GC responses here if not using callbacks
  });
  client.on("error", (err: any) => {
    console.error(err);
    failedLogin.set(logOnDetails.accountName, eresultName(err.eresult));
  });
  client.logOn(logOnDetails);
});

function selfDestruct() {
  console.log("shutting down");
  process.exit(0);
}
function getUptime() {
  return process.uptime();
}
function getOSUptime() {
  return os.uptime();
}