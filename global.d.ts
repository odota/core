declare module 'simple-vdf';
declare module 'dotaconstants';
declare module 'json-bigint';
declare module 'http-proxy';
declare module 'steam';
declare module 'dota2';
declare module 'passport-steam';
declare module 'uuid';

type StringDict = { [key: string]: string };
type NumberArrayDict =  { [key: string]: number[] }
type NumberDict = { [key: string]: number };
type ErrorCb = (err?: Error | null | undefined | unknown, result?: any) => void;
type StringErrorCb = (
  err?: Error | null | undefined | unknown,
  result?: string | null | undefined
) => void;

interface Match {
  match_id: number;
  players: Player[];
  start_time: number;
  duration: number;
  leagueid?: number;
  radiant_win: boolean;
  lobby_type: number;
  game_mode: number;
  cluster?: number;
  patch?: number;
  region?: number;

  // Computed field
  pgroup?: any;
}

interface LiveMatch extends Match {
  lobby_id: string;
}

interface ParsedMatch extends Match {
  players: ParsedPlayer[];
  version: number;
  chat: any[];
  cosmetics: any;
  objectives: any[];
  radiant_gold_adv: number[];
}

interface Player {
  player_slot: number;
  account_id: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  hero_damage: number;
  hero_healing: number;
  tower_damage: number;
  leaver_status: number;
  
  // Computed fields
  radiant_win?: boolean;
  match_id: number;
  lane_role: number;
  isRadiant?: boolean;
  win: number;
  lose: number;
  total_gold: number;
  total_xp: number;
  kills_per_min: number;
  kda: number;
  abandons: number;
  heroes: any;

  // Added in buildMatch for display
  is_subscriber: boolean;
}

interface ParsedPlayer extends Player {
    kills_log: any[];
    obs_log: any[];
    purchases: any;
    purchase_log: any[];
    pings: any;
    purchase: NumberDict;
    lane_pos: {[key: string]: NumberDict};
    gold_t: number[];
    xp_t: number[];
    lh_t: number[];
    item_uses: NumberDict;
    buyback_log: any[];
    killed: NumberDict;
  
    //Added by GC
    party_size: number;
  
    // Computed
    all_word_counts: NumberDict;
    my_word_counts: NumberDict;
    throw: number | undefined;
    comeback: number| undefined;
    loss: number| undefined;
    stomp: number| undefined;
    life_state: NumberDict;
    life_state_dead: number;
    actions: NumberDict;
    actions_per_min: number;
    purchase_ward_observer: number;
    purchase_ward_sentry: number;
    purchase_tpscroll: number;
    purchase_rapier: number;
    purchase_gem: number;
    item_win: NumberDict;
    item_usage: NumberDict;
    purchase_time: NumberDict;
    first_purchase_time: NumberDict;
    lane: number;
    is_roaming: boolean;
    lane_efficiency: number;
    lane_efficiency_pct: number;
    buyback_count: number;
    observer_uses: number;
    sentry_uses: number;
    neutral_kills: number;
    tower_kills: number;
    courier_kills: number;
    lane_kills: number;
    hero_kills: number;
    observer_kills: number;
    sentry_kills: number;
    roshan_kills: number;
    necronomicon_kills: number;
    ancient_kills: number;

    // Added temporarily
    rank_tier?: number;
  }
  
  interface GCPlayer extends Player {
    // From GC
    party_id: { low: number; high: number };
    permanent_buffs: any[];
    net_worth: number;
  }

type PlayerMatch = Player & Match & { players?: Player[] };
type ParsedPlayerMatch = ParsedPlayer & ParsedMatch & { players?: ParsedPlayer[] };

interface User {
  account_id: number;
  fh_unavailable: boolean;
  steamid: string;
  personaname: string;
  avatarfull: string;
}

interface FullHistoryJob {
  account_id: number;
  short_history?: boolean;

  // These fields don't exist on the job but we add them during processing
  fh_unavailable?: boolean;
}

interface MmrJob {
  account_id: number;
  match_id: number;
}

interface GCDataJob {
  match_id: number;
  pgroup: any;
  useGcDataArr?: boolean;
  noRetry?: boolean;
}

interface ParseJob {
  match_id: number;
  pgroup: any;
  origin?: DataOrigin;
}

type QueueJob = GCDataJob | MmrJob | ParseJob | FullHistoryJob;

interface ProPlayer {
  name: string;
  account_id: number;
}

type QueueName = 'mmrQueue' | 'countsQueue' | 'fhQueue' | 'scenariosQueue' | 'parse' | 'gcQueue';
type DataType = 'api' | 'parsed' | 'gcdata' | 'meta';
type DataOrigin = 'scanner';

// Various types of job objects mostly based on matches, e.g. adding origin
