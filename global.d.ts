declare module 'simple-vdf';
declare module 'dotaconstants';
declare module 'json-bigint';
declare module 'http-proxy';
declare module 'steam';
declare module 'dota2';
declare module 'passport-steam';
declare module 'uuid';

declare namespace Express {
  export interface Request {
    originalQuery: string;
    queryObj: QueryObj;
    user: {
      account_id: number;
    };
  }
}

type ArrayifiedFilters = { [key: string]: number[] };
type QueryObj = {
  project: (keyof ParsedPlayerMatch)[];
  filter?: ArrayifiedFilters;
  sort?: keyof ParsedPlayerMatch;
  // Number of results to return after client filter/sort
  limit?: number;
  offset?: number;
  having?: number;
  // Number of results to fetch from the database (before filter/sort)
  dbLimit?: number;
};

type StringDict = { [key: string]: string };
type NumberArrayDict = { [key: string]: number[] };
type StringArrayDict = { [key: string]: string[] };
type AnyDict = { [key: string]: any };
type NumberDict = { [key: string]: number };
type BooleanDict = { [key: string]: boolean };
type ErrorCb = (err?: Error | null | undefined | unknown, result?: any) => void;
type NonUnknownErrorCb = (err?: Error | null | undefined, result?: any) => void;
type StringErrorCb = (
  err?: Error | null | undefined | unknown,
  result?: string | null | undefined
) => void;

type Match = {
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
  radiant_team_id?: number;
  dire_team_id?: number;
  picks_bans?: any[];
  human_players: number;

  // Computed field
  pgroup: any;
  // heroes is just pgroup alias?
  heroes: any;
  average_rank?: number | null;

  // Determine if match has all data and can be archived
  can_be_archived: boolean;
};

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

interface GcMatch extends Partial<Match> {
  match_id: number;
  pgroup: any;
  players: GcPlayer[];
}

type Player = {
  player_slot: number;
  account_id?: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  denies: number;
  level: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  hero_damage: number;
  hero_healing: number;
  tower_damage: number;
  leaver_status: number;
  ability_upgrades?: any[];
  ability_upgrades_arr: number[];

  // Computed fields
  match_id?: number;
  radiant_win?: boolean;
  is_radiant: boolean;
  isRadiant?: boolean;
  win: number;
  lose: number;
  total_gold: number;
  total_xp: number;
  kills_per_min: number;
  kda: number;
  abandons: number;
  heroes: any;
  benchmarks: AnyDict;

  // In Steam API that we're manually removing
  scaled_hero_damage?: number;
  scaled_tower_damage?: number;
  scaled_hero_healing?: number;
  aghanims_shard?: number;
  aghanims_scepter?: number;
  moonshard?: number;

  // Added in buildMatch for display
  is_subscriber: boolean;
};

interface ParsedPlayer extends Player {
  kills_log: any[];
  obs_log: any[];
  purchases: any;
  purchase_log: any[];
  pings: any;
  purchase: NumberDict;
  lane_pos: { [key: string]: NumberDict };
  gold_t: number[];
  xp_t: number[];
  lh_t: number[];
  item_uses: NumberDict;
  buyback_log: any[];
  killed: NumberDict;
  stuns: number;
  obs: any;
  sen: any;
  lane_role: number | null;

  //Added by GC
  party_size: number;

  // Computed
  is_roaming?: boolean | null;
  all_word_counts: NumberDict;
  my_word_counts: NumberDict;
  throw: number | undefined;
  comeback: number | undefined;
  loss: number | undefined;
  stomp: number | undefined;
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
  lane: number | undefined | null;
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

interface GcPlayer extends Player {
  // From GC
  party_id: { low: number; high: number };
  permanent_buffs: any[];
  net_worth: number;
}

type PlayerMatch = Player & Match & { players?: Player[] };
type ParsedPlayerMatch = ParsedPlayer &
  ParsedMatch & { players?: ParsedPlayer[] };

type User = {
  account_id: number;
  fh_unavailable: boolean;
  steamid: string;
  personaname: string;
  avatarfull: string;
  last_match_time: Date;

  // Computed fields
  is_contributor: boolean;
  is_subscriber: boolean;
  status: number;
};

type PlayerRating = {
  account_id: number;
  rank_tier: number;
  leaderboard_rank: number;
};

type FullHistoryJob = {
  account_id: number;
  short_history?: boolean;

  // These fields don't exist on the job but we add them during processing
  fh_unavailable?: boolean;
};

type MmrJob = {
  account_id: number;
  match_id: number;
};

type GcDataJob = {
  match_id: number;
  pgroup: any;
  useGcDataArr?: boolean;
  noRetry?: boolean;
};

type CountsJob = Match;
type ScenariosJob = string;

type ParseJob = {
  match_id: number;
  pgroup: any;
  leagueid?: number;
  origin?: DataOrigin;
  start_time?: number;
  duration?: number;
};

type QueueJob = QueueInput['data'];
type QueueName = QueueInput['name'];
type QueueInput =
  | {
      name: 'mmrQueue';
      data: MmrJob;
    }
  | {
      name: 'countsQueue';
      data: CountsJob;
    }
  | {
      name: 'fhQueue';
      data: FullHistoryJob;
    }
  | {
      name: 'scenariosQueue';
      data: ScenariosJob;
    }
  | {
      name: 'parse';
      data: ParseJob;
    }
  | {
      name: 'gcQueue';
      data: GcDataJob;
    };

type ReliableQueueRow = {
  id: number;
  type: string;
  timestamp: string;
  attempts: number;
  data: any;
  next_attempt_time: string;
  priority: number;
};

type ReliableQueueOptions = { attempts: number; priority?: number };

type ProPlayer = {
  name: string;
  account_id: number;
};

type DataType = 'api' | 'parsed' | 'gcdata' | 'meta';
type DataOrigin = 'scanner';

type InsertMatchOptions = {
  type: DataType;
  origin?: DataOrigin;
  skipCounts?: boolean;
  forceParse?: boolean;
  skipParse?: boolean;
  priority?: number;
  attempts?: number;
};

type PathVerbSpec = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: any[];
  responses: {
    [key: number]: {
      description: string;
      content: any;
    };
  };
  route: () => string;
  func: (req: express.Request, res: express.Response, cb: ErrorCb) => void;
};

type HttpVerb = 'get' | 'post';
type OpenAPISpec = {
  openapi: string;
  info: any;
  servers: any[];
  components: any;
  paths: {
    [path: string]: {
      [key in HttpVerb]?: PathVerbSpec;
    };
  };
};
