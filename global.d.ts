declare module 'simple-vdf';
declare module 'dotaconstants';
declare module 'json-bigint';
declare module 'http-proxy';
declare module 'steam';
declare module 'dota2';
declare module 'passport-steam';

type StringDict = { [key: string]: string };
type NumberDict = { [key: string]: number };
type ErrorCb = (err?: Error | null | undefined | unknown) => void;
type StringErrorCb = (
  err?: Error | null | undefined | unknown,
  result?: string | null | undefined
) => void;

interface Match {
  match_id: number;
  start_time: number;
  duration: number;
  leagueid: number;
  radiant_win: boolean;
  lobby_type: number;
  game_mode: number;
  players: Player[];
  cluster?: number;
}

interface LiveMatch extends Match {
  lobby_id: string;
}

interface ParsedMatch extends Match {
  chat: any[];
  version: number;
  cosmetics: any;
}

interface Player {
  player_slot: number;
  account_id: number;
  hero_id: number;
  kills: number;
  deaths: number;

  // Not on most players but we sometimes add it from match
  radiant_win?: boolean;
  match_id?: number;
  rank_tier?: number;
  is_subscriber: boolean;
}

interface User {
  account_id: number;
  fh_unavailable: boolean;
  steamid: string;
  personaname: string;
  avatarfull: string;
}

interface FullHistoryJob {
  account_id: number;
  short_history: boolean;

  // These fields don't exist on the job but we add them during processing
  fh_unavailable: boolean;
  match_ids: number[];
}

interface MmrJob {
  account_id: number;
  match_id: number;
}

interface GCDataJob {
  useGcDataArr: boolean;
}

interface ParseJob {
  match_id: number;
  origin?: DataOrigin;
}

interface ParsedPlayer extends Player {
  kills_log: any[];
  obs_log: any[];
  purchases: any[];
}

interface ProPlayer {
  name: string;
  account_id: number;
}

type DataType = 'api' | 'parsed' | 'gcdata' | 'meta';
type DataOrigin = 'scanner';

// Various types of job objects mostly based on matches, e.g. adding origin
