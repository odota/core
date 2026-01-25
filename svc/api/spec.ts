import constants, { heroes, cluster } from "dotaconstants";
import moment from "moment";
import { Client } from "pg";
import config from "../../config.ts";
import { addJob, addReliableJob, getReliableJob } from "../store/queue.ts";
import { buildMatch } from "../util/buildMatch.ts";
import { getPlayerMatches } from "../util/buildPlayer.ts";
import {
  countPeers,
  isRadiant,
  mergeObjects,
  queryParamToArray,
} from "../util/utility.ts";
import {
  matchesCols,
  countsCats,
  countsCols,
  heroesCols,
  histogramCols,
  peersCols,
  prosCols,
  wardmapCols,
  wordcloudCols,
  recentMatchesCols,
} from "./playerFields.ts";
import db from "../store/db.ts";
import redis, { redisCount, redisCountDistinct } from "../store/redis.ts";
import packageJson from "../../package.json" with { type: "json" };
import generateOperationId from "./generateOperationId.ts";
import {
  getDistributions,
  getPlayerRatings,
  getHeroBenchmarks,
  getHeroItemPopularity,
  getHeroRankings,
  getLaneRoles,
  getMetadata,
  getPeers,
  getPlayer,
  getPlayerHeroRankings,
  getProPeers,
  getTeamScenarios,
  getItemTimings,
  search,
} from "../util/queries.ts";
import heroParams from "./requests/heroParams.ts";
import leagueParams from "./requests/leagueParams.ts";
import matchParams from "./requests/matchParams.ts";
import playerParams from "./requests/playerParams.ts";
import scenarioParams from "./requests/scenarioParams.ts";
import teamParams from "./requests/teamParams.ts";
import BenchmarksResponse from "./responses/BenchmarksResponse.ts";
import DistributionsResponse from "./responses/DistributionsResponse.ts";
import HeroDurationsResponse from "./responses/HeroDurationsResponse.ts";
import HeroItemPopularityResponse from "./responses/HeroItemPopularityResponse.ts";
import HeroMatchupsResponse from "./responses/HeroMatchupsResponse.ts";
import HeroObjectResponse from "./responses/HeroObjectResponse.ts";
import HeroStatsResponse from "./responses/HeroStatsResponse.ts";
import LeagueObjectResponse from "./responses/LeagueObjectResponse.ts";
import MatchObjectResponse from "./responses/MatchObjectResponse.ts";
import MatchResponse from "./responses/MatchResponse.ts";
import MetadataResponse from "./responses/MetadataResponse.ts";
import ParsedMatchesResponse from "./responses/ParsedMatchesResponse.ts";
import PlayerCountsResponse from "./responses/PlayerCountsResponse.ts";
import PlayerHeroesResponse from "./responses/PlayerHeroesResponse.ts";
import PlayerMatchesResponse from "./responses/PlayerMatchesResponse.ts";
import PlayerObjectResponse from "./responses/PlayerObjectResponse.ts";
import PlayerPeersResponse from "./responses/PlayerPeersResponse.ts";
import PlayerProsResponse from "./responses/PlayerProsResponse.ts";
import PlayerRankingsResponse from "./responses/PlayerRankingsResponse.ts";
import PlayerRatingsResponse from "./responses/PlayerRatingsResponse.ts";
import PlayerRecentMatchesResponse from "./responses/PlayerRecentMatchesResponse.ts";
import PlayersResponse from "./responses/PlayersResponse.ts";
import PlayerTotalsResponse from "./responses/PlayerTotalsResponse.ts";
import PlayerWardMapResponse from "./responses/PlayerWardMapResponse.ts";
import PlayerWinLossResponse from "./responses/PlayerWinLossResponse.ts";
import PlayerWordCloudResponse from "./responses/PlayerWordCloudResponse.ts";
import PublicMatchesResponse from "./responses/PublicMatchesResponse.ts";
import RankingsResponse from "./responses/RankingsResponse.ts";
import RecordsResponse from "./responses/RecordsResponse.ts";
import ScenarioItemTimingsResponse from "./responses/ScenarioItemTimingsResponse.ts";
import ScenarioLaneRolesResponse from "./responses/ScenarioLaneRolesResponse.ts";
import ScenarioMiscResponse from "./responses/ScenarioMiscResponse.ts";
import SchemaResponse from "./responses/SchemaResponse.ts";
import SearchResponse from "./responses/SearchResponse.ts";
import TeamHeroesResponse from "./responses/TeamHeroesResponse.ts";
import TeamMatchObjectResponse from "./responses/TeamMatchObjectResponse.ts";
import TeamObjectResponse from "./responses/TeamObjectResponse.ts";
import TeamPlayersResponse from "./responses/TeamPlayersResponse.ts";
import { PRIORITY } from "../util/priority.ts";
import { getPatchIndex } from "../util/compute.ts";
import { matchupToString } from "../util/matchups.ts";

const parameters = {
  ...heroParams,
  ...leagueParams,
  ...matchParams,
  ...playerParams,
  ...scenarioParams,
  ...teamParams,
};

const schemas = {
  ...BenchmarksResponse,
  ...DistributionsResponse,
  ...HeroDurationsResponse,
  ...HeroItemPopularityResponse,
  ...HeroMatchupsResponse,
  ...HeroObjectResponse,
  ...HeroStatsResponse,
  ...LeagueObjectResponse,
  ...MatchObjectResponse,
  ...MatchResponse,
  ...MetadataResponse,
  ...ParsedMatchesResponse,
  ...PlayerCountsResponse,
  ...PlayerHeroesResponse,
  ...PlayerMatchesResponse,
  ...PlayerObjectResponse,
  ...PlayerPeersResponse,
  ...PlayerProsResponse,
  ...PlayerRankingsResponse,
  ...PlayerRatingsResponse,
  ...PlayerRecentMatchesResponse,
  ...PlayersResponse,
  ...PlayerTotalsResponse,
  ...PlayerWardMapResponse,
  ...PlayerWinLossResponse,
  ...PlayerWordCloudResponse,
  ...PublicMatchesResponse,
  ...RankingsResponse,
  ...RecordsResponse,
  ...ScenarioItemTimingsResponse,
  ...ScenarioLaneRolesResponse,
  ...ScenarioMiscResponse,
  ...SchemaResponse,
  ...SearchResponse,
  ...TeamHeroesResponse,
  ...TeamMatchObjectResponse,
  ...TeamObjectResponse,
  ...TeamPlayersResponse,
};

const playerParamNames = [
  "accountIdParam",
  "limitParam",
  "offsetParam",
  "winParam",
  "patchParam",
  "gameModeParam",
  "lobbyTypeParam",
  "regionParam",
  "dateParam",
  "laneRoleParam",
  "heroIdParam",
  "isRadiantParam",
  "includedAccountIdParam",
  "excludedAccountIdParam",
  "withHeroIdParam",
  "againstHeroIdParam",
  "significantParam",
  "havingParam",
  "sortParam",
];
const playerParamsList = playerParamNames.map((paramName) => ({
  $ref: `#/components/parameters/${paramName}`,
}));

const securitySchemes = {
  api_key: {
    type: "apiKey",
    name: "api_key",
    description: `Use an API key to remove monthly call limits and to receive higher rate limits. [Learn more and get your API key](https://www.opendota.com/api-keys).
        Usage example: https://api.opendota.com/api/matches/271145478?api_key=YOUR-API-KEY
        
        API key can also be sent using the authorization header "Authorization: Bearer YOUR-API-KEY"
        `,
    in: "query",
  },
};

const spec: OpenAPISpec = {
  openapi: "3.0.3",
  info: {
    title: "OpenDota API",
    description: `# Introduction
The OpenDota API provides Dota 2 related data including advanced match data extracted from match replays.

You can find data that can be used to convert hero and ability IDs and other information provided by the API from the [dotaconstants](https://github.com/odota/dotaconstants) repository.

You can use the API without a key, but registering for a key allows increased rate limits and usage. Check out the [API page](https://www.opendota.com/api-keys) to learn more.
    `,
    version: packageJson.version,
  },
  servers: [
    {
      url: "https://api.opendota.com/api",
    },
  ],
  components: {
    securitySchemes,
    schemas,
    parameters,
  },
  paths: {
    "/matches/{match_id}": {
      get: {
        operationId: generateOperationId("get", "/matches/{match_id}"),
        summary: "GET /matches/{match_id}",
        description: "Match data",
        tags: ["matches"],
        parameters: [{ $ref: "#/components/parameters/matchIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/MatchResponse",
                },
              },
            },
          },
        },
        route: () => "/matches/:match_id",
        func: async (req, res, next) => {
          const match = await buildMatch(Number(req.params.match_id), {
            meta: Boolean(req.query.meta),
          });
          if (!match) {
            // 404 for match not found
            return next();
          }
          return res.json(match);
        },
      },
    },
    "/players/{account_id}": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}"),
        summary: "GET /players/{account_id}",
        description: "Player data",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayersResponse",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id",
        func: async (req, res, next) => {
          const accountId = Number(req.params.account_id);
          const playerData = await getPlayer(accountId);
          if (!playerData) {
            // 404 error
            return next();
          }
          const [
            rankTier,
            leaderboardRank,
            computedRating,
            computedRatingTurbo,
            aliases,
          ] = await Promise.all([
            db.first().from("rank_tier").where({ account_id: accountId }),
            db
              .first()
              .from("leaderboard_rank")
              .where({ account_id: accountId }),
            db
              .first()
              .from("player_computed_mmr")
              .where({ account_id: accountId }),
            db
              .first()
              .from("player_computed_mmr_turbo")
              .where({ account_id: accountId }),
            db
              .select("personaname", "name_since")
              .from("aliases")
              .where({ account_id: accountId }),
          ]);
          const result = {
            profile: playerData,
            rank_tier: rankTier?.rating ?? null,
            leaderboard_rank: leaderboardRank?.rating ?? null,
            computed_mmr: computedRating?.computed_mmr ?? null,
            computed_mmr_turbo: computedRatingTurbo?.computed_mmr ?? null,
            aliases,
          };
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/wl": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/wl"),
        summary: "GET /players/{account_id}/wl",
        description: "Win/Loss count",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayerWinLossResponse",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wl",
        func: async (req, res, next) => {
          const result = {
            win: 0,
            lose: 0,
          };
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            if (isRadiant(m) === m.radiant_win) {
              result.win += 1;
            } else {
              result.lose += 1;
            }
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/recentMatches": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/recentMatches",
        ),
        summary: "GET /players/{account_id}/recentMatches",
        description: "Recent matches played (limited number of results)",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    items: {
                      $ref: "#/components/schemas/PlayerRecentMatchesResponse",
                    },
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/recentMatches",
        func: async (req, res, next) => {
          const queryObj = res.locals.queryObj;
          // Endpoint is limited to last 20 server results only
          // Endpoint doesn't support projection and always returns the same set of columns
          queryObj.project = recentMatchesCols;
          queryObj.dbLimit = 20;
          // Disable significance filter since we want to show turbo matches by default
          queryObj.filter?.delete("significant");
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            queryObj,
          );
          return res.json(cache);
        },
      },
    },
    "/players/{account_id}/matches": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/matches",
        ),
        summary: "GET /players/{account_id}/matches",
        description:
          "Matches played (full history, and supports column selection)",
        tags: ["players"],
        parameters: [
          ...playerParamsList,
          {
            $ref: "#/components/parameters/projectParam",
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerMatchesResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/matches",
        func: async (req, res, next) => {
          let userFields = queryParamToArray(
            req.query.project,
          ) as (keyof ParsedPlayerMatch)[];
          const additionalFields = userFields.length ? userFields : matchesCols;
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(additionalFields);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          return res.json(cache);
        },
      },
    },
    "/players/{account_id}/heroes": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/heroes"),
        summary: "GET /players/{account_id}/heroes",
        description: "Heroes played",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerHeroesResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/heroes",
        func: async (req, res, next) => {
          const counts: AnyDict = {};
          // prefill heroes with every hero
          Object.keys(heroes).forEach((heroId) => {
            const hero_id_int = parseInt(heroId);
            const hero = {
              hero_id: hero_id_int,
              last_played: 0,
              games: 0,
              win: 0,
              with_games: 0,
              with_win: 0,
              against_games: 0,
              against_win: 0,
            };
            counts[hero_id_int] = hero;
          });
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(heroesCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            const playerWin = isRadiant(m) === m.radiant_win;
            const group: PGroup = m.heroes || {};
            Object.keys(group).forEach((key) => {
              const tm = group[key];
              const tmHero = tm.hero_id;
              // don't count invalid heroes
              if (tmHero in counts) {
                if (isRadiant({ player_slot: Number(key) }) === isRadiant(m)) {
                  if (tm.account_id === m.account_id) {
                    counts[tmHero].games += 1;
                    counts[tmHero].win += playerWin ? 1 : 0;
                    if (m.start_time > counts[tmHero].last_played) {
                      counts[tmHero].last_played = m.start_time;
                    }
                  } else {
                    counts[tmHero].with_games += 1;
                    counts[tmHero].with_win += playerWin ? 1 : 0;
                  }
                } else {
                  counts[tmHero].against_games += 1;
                  counts[tmHero].against_win += playerWin ? 1 : 0;
                }
              }
            });
          });
          const result = Object.keys(counts)
            .map((k) => counts[k])
            .filter(
              (hero) =>
                !res.locals.queryObj.having ||
                hero.games >= Number(res.locals.queryObj.having),
            )
            .sort((a, b) => b.games - a.games);
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/peers": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/peers"),
        summary: "GET /players/{account_id}/peers",
        description: "Players played with",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerPeersResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/peers",
        func: async (req, res, next) => {
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(peersCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          const teammates = countPeers(cache);
          const result = await getPeers(teammates, {
            account_id: Number(req.params.account_id),
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/pros": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/pros"),
        summary: "GET /players/{account_id}/pros",
        description: "Pro players played with",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerProsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/pros",
        func: async (req, res, next) => {
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(prosCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          const teammates = countPeers(cache);
          const result = await getProPeers(teammates, {
            account_id: Number(req.params.account_id),
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/totals": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/totals"),
        summary: "GET /players/{account_id}/totals",
        description: "Totals in stats",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerTotalsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/totals",
        func: async (req, res, next) => {
          const result: AnyDict = {};
          histogramCols.forEach((key) => {
            result[key] = {
              field: key,
              n: 0,
              sum: 0,
            };
          });
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(histogramCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            histogramCols.forEach((key) => {
              if (m[key] !== null && m[key] !== undefined) {
                result[key].n += 1;
                result[key].sum += Number(m[key]);
              }
            });
          });
          return res.json(Object.keys(result).map((key) => result[key]));
        },
      },
    },
    "/players/{account_id}/counts": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/counts"),
        summary: "GET /players/{account_id}/counts",
        description: "Counts in categories",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayerCountsResponse",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/counts",
        func: async (req, res, next) => {
          const result = {} as Record<(typeof countsCats)[number], any>;
          countsCats.forEach((key) => {
            result[key] = {};
          });
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(countsCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            // Compute the needed fields
            const record: Record<
              (typeof countsCats)[number],
              number | boolean | null
            > = {
              is_radiant: isRadiant(m),
              patch: getPatchIndex(m.start_time),
              region: cluster[String(m.cluster) as keyof typeof cluster],
              leaver_status: m.leaver_status,
              game_mode: m.game_mode,
              lobby_type: m.lobby_type,
              lane_role: m.lane_role,
            };
            countsCats.forEach((key) => {
              if (!result[key][Math.floor(Number(record[key]))]) {
                result[key][Math.floor(Number(record[key]))] = {
                  games: 0,
                  win: 0,
                };
              }
              result[key][Math.floor(Number(record[key]))].games += 1;
              const won = Number(m.radiant_win === isRadiant(m));
              result[key][Math.floor(Number(record[key]))].win += won;
            });
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/histograms/{field}": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/histograms/{field}",
        ),
        summary: "GET /players/{account_id}/histograms",
        description: "Distribution of matches in a single stat",
        tags: ["players"],
        parameters: [
          ...playerParamsList,
          {
            $ref: "#/components/parameters/fieldParam",
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    title: "PlayerHistogramsResponse",
                    type: "object",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/histograms/:field",
        func: async (req, res, next) => {
          const field = histogramCols.find((key) => key === req.params.field);
          if (field) {
            res.locals.queryObj.project =
              res.locals.queryObj.project.concat(field);
          } else {
            return res.json([]);
          }
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          const buckets = 40;
          // Find the maximum value to determine how large each bucket should be
          const max = Math.max(...cache.map((m) => m[field]));
          // Round the bucket size up to the nearest integer
          const bucketSize = Math.ceil((max + 1) / buckets);
          const bucketArray = Array.from(
            {
              length: buckets,
            },
            (value, index) => ({
              x: bucketSize * index,
              games: 0,
              win: 0,
            }),
          );
          cache.forEach((m) => {
            if (m[field] || m[field] === 0) {
              const index = Math.floor(m[field] / bucketSize);
              if (bucketArray[index]) {
                bucketArray[index].games += 1;
                bucketArray[index].win +=
                  isRadiant(m) === m.radiant_win ? 1 : 0;
              }
            }
          });
          return res.json(bucketArray);
        },
      },
    },
    "/players/{account_id}/wardmap": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/wardmap",
        ),
        summary: "GET /players/{account_id}/wardmap",
        description: "Wards placed in matches played",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayerWardMapResponse",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wardmap",
        func: async (req, res, next) => {
          const result = {} as Record<(typeof wardmapCols)[number], any>;
          wardmapCols.forEach((key) => {
            result[key] = {};
          });
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(wardmapCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            Object.keys(result).forEach((key) => {
              mergeObjects(
                result[key as keyof typeof result],
                m[key as keyof ParsedPlayerMatch],
              );
            });
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/wordcloud": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/wordcloud",
        ),
        summary: "GET /players/{account_id}/wordcloud",
        description: "Words said/read in matches played",
        tags: ["players"],
        parameters: playerParamsList,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayerWordCloudResponse",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wordcloud",
        func: async (req, res, next) => {
          const result = {} as Record<(typeof wordcloudCols)[number], any>;
          wordcloudCols.forEach((key) => {
            result[key] = {};
          });
          res.locals.queryObj.project =
            res.locals.queryObj.project.concat(wordcloudCols);
          const cache = await getPlayerMatches(
            Number(req.params.account_id),
            res.locals.queryObj,
          );
          cache.forEach((m) => {
            Object.keys(result).forEach((key) => {
              mergeObjects(
                result[key as keyof typeof result],
                m[key as keyof ParsedPlayerMatch],
              );
            });
          });
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/ratings": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/ratings",
        ),
        summary: "GET /players/{account_id}/ratings",
        description:
          "Returns a history of the player rank tier/medal changes (replaces MMR)",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerRatingsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/ratings",
        func: async (req, res, next) => {
          if (res.locals.queryObj.isPrivate) {
            return res.json([]);
          }
          const result = await getPlayerRatings(req.params.account_id);
          return res.json(result);
        },
      },
    },
    "/players/{account_id}/rankings": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/rankings",
        ),
        summary: "GET /players/{account_id}/rankings",
        description: "Player hero rankings",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerRankingsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/rankings",
        func: async (req, res, next) => {
          if (res.locals.queryObj.isPrivate) {
            return res.json([]);
          }
          return res.json(await getPlayerHeroRankings(req.params.account_id));
        },
      },
    },
    "/players/{account_id}/refresh": {
      post: {
        operationId: generateOperationId("post", "/refresh"),
        summary: "POST /players/{account_id}/refresh",
        description:
          "Refresh player match history (up to 500), medal (rank), and profile name",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {},
              },
            },
          },
        },
        route: () => "/players/:account_id/refresh",
        func: async (req, res, next) => {
          await addReliableJob(
            {
              name: "fhQueue",
              data: {
                account_id: Number(req.params.account_id),
              },
            },
            {},
          );
          // Also queue a refresh of the user's rank/medal
          await addJob({
            name: "mmrQueue",
            data: {
              account_id: Number(req.params.account_id),
            },
          });
          // Queue a refresh of the player name
          await addJob({
            name: "profileQueue",
            data: {
              account_id: Number(req.params.account_id),
            },
          });
          return res.json({});
        },
      },
    },
    "/topPlayers": {
      get: {
        operationId: generateOperationId("get", "/topPlayers"),
        summary: "GET /topPlayers",
        description: "Get list of highly ranked players",
        tags: ["top players"],
        parameters: [
          {
            name: "turbo",
            in: "query",
            description: "Get ratings based on turbo matches",
            required: false,
            schema: {
              type: "integer",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/topPlayers",
        func: async (req, res, next) => {
          const turbo = Boolean(req.query.turbo);
          const tableName = turbo
            ? "player_computed_mmr_turbo"
            : "player_computed_mmr";
          const result = await db
            .select([
              "*",
              "players.account_id as account_id",
              "rank_tier.rating as rank_tier",
            ])
            .from(tableName)
            .join("players", "players.account_id", `${tableName}.account_id`)
            .leftJoin(
              "notable_players",
              "players.account_id",
              "notable_players.account_id",
            )
            .leftJoin("rank_tier", "players.account_id", "rank_tier.account_id")
            .orderBy(`${tableName}.computed_mmr`, "desc")
            .limit(100);
          return res.json(result);
        },
      },
    },
    "/proPlayers": {
      get: {
        operationId: generateOperationId("get", "/proPlayers"),
        summary: "GET /proPlayers",
        description: "Get list of pro players",
        tags: ["pro players"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PlayerObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/proPlayers",
        func: async (req, res, next) => {
          const result = await db
            .select()
            .from("players")
            .rightJoin(
              "notable_players",
              "players.account_id",
              "notable_players.account_id",
            )
            .orderBy("notable_players.account_id", "asc");
          return res.json(result);
        },
      },
    },
    "/proMatches": {
      get: {
        operationId: generateOperationId("get", "/proMatches"),
        summary: "GET /proMatches",
        description: "Get list of pro matches",
        tags: ["pro matches"],
        parameters: [{ $ref: "#/components/parameters/lessThanMatchIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/MatchObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/proMatches",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `
          SELECT match_id, duration, start_time,
          radiant_team_id, radiant.name as radiant_name,
          dire_team_id, dire.name as dire_name,
          leagueid, leagues.name as league_name,
          series_id, series_type,
          radiant_score, dire_score,
          radiant_win, version
          FROM matches
          LEFT JOIN teams radiant
          ON radiant.team_id = matches.radiant_team_id
          LEFT JOIN teams dire
          ON dire.team_id = matches.dire_team_id
          LEFT JOIN leagues USING(leagueid)
          WHERE match_id < ?
          ORDER BY match_id DESC
          LIMIT 100
          `,
            [req.query.less_than_match_id || Number.MAX_SAFE_INTEGER],
          );
          return res.json(rows);
        },
      },
    },
    "/publicMatches": {
      get: {
        operationId: generateOperationId("get", "/publicMatches"),
        summary: "GET /publicMatches",
        description: "Get list of randomly sampled public matches",
        tags: ["public matches"],
        parameters: [
          { $ref: "#/components/parameters/lessThanMatchIdParam" },
          { $ref: "#/components/parameters/minRankParam" },
          { $ref: "#/components/parameters/maxRankParam" },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/PublicMatchesResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/publicMatches",
        func: async (req, res, next) => {
          const lessThan =
            Number(req.query.less_than_match_id) || Number.MAX_SAFE_INTEGER;
          const minRank = Math.min(Number(req.query.min_rank), 75) || 0;
          const maxRank =
            Math.max(Number(req.query.max_rank), 15) || Number.MAX_SAFE_INTEGER;
          const { rows } = await db.raw(
            `
          SELECT * FROM public_matches
          WHERE match_id < ?
          AND avg_rank_tier >= ?
          AND avg_rank_tier <= ?
          ORDER BY match_id DESC
          LIMIT 100
          `,
            [lessThan, minRank, maxRank],
          );
          return res.json(rows);
        },
      },
    },
    "/parsedMatches": {
      get: {
        operationId: generateOperationId("get", "/parsedMatches"),
        summary: "GET /parsedMatches",
        description: "Get list of parsed match IDs",
        tags: ["parsed matches"],
        parameters: [{ $ref: "#/components/parameters/lessThanMatchIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ParsedMatchesResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/parsedMatches",
        func: async (req, res, next) => {
          const lessThan =
            req.query.less_than_match_id || Number.MAX_SAFE_INTEGER;
          const { rows } = await db.raw(
            `
          SELECT match_id FROM parsed_matches
          WHERE match_id < ?
          ORDER BY match_id DESC
          LIMIT 100
          `,
            [lessThan],
          );
          return res.json(rows);
        },
      },
    },
    "/explorer": {
      get: {
        operationId: generateOperationId("get", "/explorer"),
        summary: "GET /explorer",
        description: "Submit arbitrary SQL queries to the database",
        tags: ["explorer"],
        parameters: [
          {
            name: "sql",
            in: "query",
            description: "The PostgreSQL query as percent-encoded string.",
            required: false,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "ExplorerResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/explorer",
        func: async (req, res) => {
          const input = req.query.sql;
          if (typeof input !== "string") {
            return res.status(400).json({ error: "sql is not a string" });
          }
          const client = new Client({
            connectionString: config.READONLY_POSTGRES_URL,
            statement_timeout: 15000,
          });
          let result = null;
          let err = null;
          try {
            await client.connect();
            result = await client.query(input);
          } catch (e) {
            err = e;
          }
          await client.end();
          const final = { ...result, err: err && err.toString() };
          return res.status(err ? 400 : 200).json(final);
        },
      },
    },
    "/metadata": {
      get: {
        operationId: generateOperationId("get", "/metadata"),
        summary: "GET /metadata",
        description: "Site metadata",
        tags: ["metadata"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/MetadataResponse",
                },
              },
            },
          },
        },
        route: () => "/metadata",
        func: async (req, res, next) => {
          return res.json(await getMetadata(req));
        },
      },
    },
    "/distributions": {
      get: {
        operationId: generateOperationId("get", "/distributions"),
        summary: "GET /distributions",
        description: "Distributions of MMR data by bracket and country",
        tags: ["distributions"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/DistributionsResponse",
                },
              },
            },
          },
        },
        route: () => "/distributions",
        func: async (req, res, next) => {
          const result = await getDistributions();
          return res.json(result);
        },
      },
    },
    "/search": {
      get: {
        operationId: generateOperationId("get", "/search"),
        summary: "GET /search",
        description: "Search players by personaname.",
        tags: ["search"],
        parameters: [
          {
            name: "q",
            in: "query",
            description: "Search string",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/SearchResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/search",
        func: async (req, res, next) => {
          if (typeof req.query.q !== "string") {
            return res.status(400).json({ error: "q is not a string" });
          }
          let result = await search(req.query.q);
          return res.json(result);
        },
      },
    },
    "/rankings": {
      get: {
        operationId: generateOperationId("get", "/rankings"),
        summary: "GET /rankings",
        description: "Top players by hero",
        tags: ["rankings"],
        parameters: [
          {
            name: "hero_id",
            in: "query",
            description: "Hero ID",
            required: true,
            schema: {
              type: "string", // todo: String for hero id?
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/RankingsResponse",
                },
              },
            },
          },
        },
        route: () => "/rankings",
        func: async (req, res, next) => {
          if (typeof req.query.hero_id !== "string") {
            return res.status(400).json({ error: "hero_id is not a string" });
          }
          return res.json(await getHeroRankings(req.query.hero_id));
        },
      },
    },
    "/benchmarks": {
      get: {
        operationId: generateOperationId("get", "/benchmarks"),
        summary: "GET /benchmarks",
        description: "Benchmarks of average stat values for a hero",
        tags: ["benchmarks"],
        parameters: [
          {
            name: "hero_id",
            in: "query",
            description: "Hero ID",
            required: true,
            schema: {
              type: "string", // todo: String for hero id?
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/BenchmarksResponse",
                },
              },
            },
          },
        },
        route: () => "/benchmarks",
        func: async (req, res, next) => {
          if (typeof req.query.hero_id !== "string") {
            return res.status(400).json({ error: "hero_id is not a string" });
          }
          const result = await getHeroBenchmarks(req.query.hero_id);
          return res.json(result);
        },
      },
    },
    "/health": {
      get: {
        operationId: generateOperationId("get", "/health"),
        summary: "GET /health",
        description: "Get service health data",
        tags: ["health"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "HealthResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/health{/:metric}",
        func: async (req, res, next) => {
          const result = await redis.get("health:v2");
          if (!result) {
            return res.json(result);
          }
          const data: Record<string, Metric> = JSON.parse(result);
          if (!req.params.metric) {
            const allHealthy = Object.values(data).every(
              (single) => single.metric < single.limit,
            );
            return res.status(allHealthy ? 200 : 500).json(data);
          }
          const single: Metric = data[req.params.metric];
          const healthy = single?.metric < single?.limit;
          return res.status(healthy ? 200 : 500).json(single);
        },
      },
    },
    "/request/{jobId}": {
      get: {
        operationId: generateOperationId("get", "/request/{jobId}"),
        summary: "GET /request/{jobId}",
        description: "Get parse request state",
        tags: ["request"],
        parameters: [
          {
            name: "jobId",
            in: "path",
            description: "The job ID to query.",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "RequestJobResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/request/:jobId",
        func: async (req, res, next) => {
          const job = await getReliableJob(req.params.jobId);
          if (job) {
            return res.json({ ...job, jobId: job.id });
          }
          return res.json(null);
        },
      },
    },
    "/request/{match_id}": {
      post: {
        operationId: generateOperationId("post", "/request/{jobId}"),
        summary: "POST /request/{match_id}",
        description:
          "Submit a new parse request. This call counts as 10 calls for rate limit (but not billing) purposes.",
        tags: ["request"],
        parameters: [{ $ref: "#/components/parameters/matchIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "RequestMatchResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/request/:match_id",
        func: async (req, res, next) => {
          // We validated the ID in middleware
          const matchId = req.params.match_id;
          // Count this request
          redisCount("request");
          redisCountDistinct("distinct_request", matchId);
          let priority = PRIORITY.REQUEST_DEFAULT;
          let numAttempts = 1;
          let delayMs = 0;
          if (req.query.api_key) {
            priority = PRIORITY.REQUEST_API_KEY;
            redisCount("request_api_key");
          }
          if (req.headers.origin === config.UI_HOST) {
            // Give UI requests higher priority
            priority = PRIORITY.REQUEST_UI;
            redisCount("request_ui");
            // Delay the job 1s to give UI time to connect to logs
            delayMs = 1000;
          }
          // if (await checkIsParsed(Number(matchId))) {
          //   // Deprioritize reparsing already parsed matches
          //   priority = PRIORITY.REQUEST_ALREADY_PARSED;
          // }
          // if (
          //   req.user?.account_id &&
          //   (await isSubscriber(req.user.account_id))
          // ) {
          //   // Give subscribers higher parse priority
          //   priority = PRIORITY_REQUEST_SUBSCRIBER;
          // }
          await addReliableJob(
            {
              name: "gcdata",
              data: {
                match_id: Number(matchId),
                reconcile: false,
              },
            },
            { priority },
          );
          const parseJob = await addReliableJob(
            {
              name: "parse",
              data: { match_id: Number(matchId) },
            },
            {
              attempts: numAttempts,
              priority,
              delayMs,
            },
          );
          if (!parseJob) {
            redisCount("add_queue_fail");
            throw new Error("no job created");
          }
          return res.json({
            job: {
              jobId: parseJob.id,
            },
          });
        },
      },
    },
    "/findMatches": {
      get: {
        operationId: generateOperationId("get", "/findMatches"),
        summary: "GET /",
        description: "Finds recent matches by heroes played",
        tags: ["findMatches"],
        parameters: [
          {
            name: "teamA",
            in: "query",
            description: "Hero IDs on first team (array)",
            required: false,
            style: "form",
            explode: false,
            schema: {
              type: "array",
              items: {
                type: "integer",
              },
            },
          },
          {
            name: "teamB",
            in: "query",
            description: "Hero IDs on second team (array)",
            required: false,
            style: "form",
            explode: false,
            schema: {
              type: "array",
              items: {
                type: "integer",
              },
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "FindMatchesResponse",
                  type: "array",
                  items: {
                    type: "object",
                  },
                },
              },
            },
          },
        },
        route: () => "/findMatches",
        func: async (req, res, next) => {
          // accept as input two arrays of up to 5
          const t0 = queryParamToArray(req.query.teamA).map(Number).slice(0, 5);
          const t1 = queryParamToArray(req.query.teamB).map(Number).slice(0, 5);
          // Construct key for redis
          const key = `combos:${matchupToString(t0, t1, true)}`;
          const reply = await redis.get(key);
          if (reply) {
            return res.end(reply);
          }
          // Determine which comes first
          // const rcg = groupToString(t0);
          // const dcg = groupToString(t1);
          // const inverted = rcg > dcg;
          const inverted = false;
          const teamA = inverted ? t1 : t0;
          const teamB = inverted ? t0 : t1;
          const { rows } = await db.raw(
            "select match_id, radiant_team as teamA, dire_team as teamB, radiant_win as teamAWin, start_time from public_matches where (radiant_team @> ? AND dire_team @> ?) OR (radiant_team @> ? AND dire_team @> ?) order by match_id desc limit 10",
            [teamA, teamB, teamB, teamA],
          );
          redis.setex(key, 60, JSON.stringify(rows));
          return res.json(rows);
        },
      },
    },
    "/heroes": {
      get: {
        operationId: generateOperationId("get", "/heroes"),
        summary: "GET /heroes",
        description: "Get hero data",
        tags: ["heroes"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HeroObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes",
        func: async (req, res, next) => {
          const result = await db.select().from("heroes").orderBy("id", "asc");
          return res.json(result);
        },
      },
    },
    "/heroStats": {
      get: {
        operationId: generateOperationId("get", "/heroStats"),
        summary: "GET /heroStats",
        description: "Get stats about hero performance in recent matches",
        tags: ["hero stats"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HeroStatsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/heroStats",
        func: async (req, res, next) => {
          const cached = await redis.get("heroStats2");
          if (cached) {
            return res.json(JSON.parse(cached));
          }
          // Assemble the result for each hero
          const result = await Promise.all(
            Object.values(heroes).map((hero) => getHeroStat(hero)),
          );
          redis.setex("heroStats2", 60, JSON.stringify(result));
          return res.json(result);

          async function getHeroStat(hero: any) {
            const final = { ...hero };
            // Add all the count properties
            const names = ["pick", "win", "ban"];
            const tiers = [
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "turbo",
              "pro",
              "pub",
            ];
            const tierNames: string[][] = [];
            tiers.forEach((tier) => {
              names.forEach((name) => {
                if (name === "ban" && tier !== "pro") {
                  // Only pro has ban counts
                  return;
                }
                tierNames.push([tier, name]);
              });
            });
            await Promise.all(
              tierNames.map(async ([tier, name]) => {
                const heroId = hero.id;
                const keyArr = [];
                for (let i = 6; i >= 0; i -= 1) {
                  keyArr.push(
                    // Redis keys are in the format `${heroId}:${tier}:${name}:${timestamp}`
                    // Get the unix timestamps for the start of the last 7 days
                    `${heroId}:${tier}:${name}:${moment
                      .utc()
                      .startOf("day")
                      .subtract(i, "day")
                      .format("X")}`,
                  );
                }
                // mget the 7 keys for this hero and sum them
                const counts = await redis.mget(...keyArr);
                const sum = counts.reduce((a, b) => Number(a) + Number(b), 0);
                // Object keys are in the format `${tier}_${name}`
                // For compatibility, turbo has s on the end (picks/wins)
                const objKey = `${tier}_${name}${tier === "turbo" ? "s" : ""}`;
                final[objKey] = sum;
                if (tier === "pub" || tier === "turbo") {
                  final[objKey + "_trend"] = counts.map(Number);
                }
              }),
            );
            return final;
          }
        },
      },
    },
    "/heroes/{hero_id}/matches": {
      get: {
        operationId: generateOperationId("get", "/heroes/{hero_id}/matches"),
        summary: "GET /heroes/{hero_id}/matches",
        description: "Get recent matches with a hero",
        tags: ["heroes"],
        parameters: [{ $ref: "#/components/parameters/heroIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/MatchObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/matches",
        func: async (req, res, next) => {
          const heroId = req.params.hero_id;
          const { rows } = await db.raw(
            `SELECT
            matches.match_id,
            matches.start_time,
            matches.duration,
            matches.radiant_win,
            matches.leagueid,
            leagues.name as league_name,
            ((player_matches.player_slot < 128) = matches.radiant_win) radiant,
            player_matches.player_slot,
            player_matches.account_id,
            player_matches.kills,
            player_matches.deaths,
            player_matches.assists
            FROM matches
            JOIN player_matches using(match_id)
            JOIN leagues using(leagueid)
            LEFT JOIN heroes on heroes.id = player_matches.hero_id
            WHERE player_matches.hero_id = ?
            ORDER BY matches.match_id DESC
            LIMIT 100`,
            [heroId],
          );
          return res.json(rows);
        },
      },
    },
    "/heroes/{hero_id}/matchups": {
      get: {
        operationId: generateOperationId("get", "/heroes/{hero_id}/matchups"),
        summary: "GET /heroes/{hero_id}/matchups",
        description: "Get results against other heroes for a hero",
        tags: ["heroes"],
        parameters: [{ $ref: "#/components/parameters/heroIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HeroMatchupsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/matchups",
        func: async (req, res, next) => {
          const heroId = req.params.hero_id;
          const { rows } = await db.raw(
            `SELECT
            pm2.hero_id,
            count(player_matches.match_id) games_played,
            sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN player_matches using(match_id)
            JOIN player_matches pm2 on player_matches.match_id = pm2.match_id AND (player_matches.player_slot < 128) != (pm2.player_slot < 128)
            WHERE player_matches.hero_id = ?
            AND matches.start_time > ?
            GROUP BY pm2.hero_id
            ORDER BY games_played DESC`,
            [heroId, moment.utc().subtract(1, "year").format("X")],
          );
          return res.json(rows);
        },
      },
    },
    "/heroes/{hero_id}/durations": {
      get: {
        operationId: generateOperationId("get", "/heroes/{hero_id}/durations"),
        summary: "GET /heroes/{hero_id}/durations",
        description: "Get hero performance over a range of match durations",
        tags: ["heroes"],
        parameters: [{ $ref: "#/components/parameters/heroIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HeroDurationsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/durations",
        func: async (req, res, next) => {
          const heroId = req.params.hero_id;
          const { rows } = await db.raw(
            `SELECT
            (matches.duration / 300 * 300) duration_bin,
            count(match_id) games_played,
            sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN player_matches using(match_id)
            WHERE player_matches.hero_id = ?
            GROUP BY (matches.duration / 300 * 300)`,
            [heroId],
          );
          return res.json(rows);
        },
      },
    },
    "/heroes/{hero_id}/players": {
      get: {
        operationId: generateOperationId("get", "/heroes/{hero_id}/players"),
        summary: "GET /heroes/{hero_id}/players",
        description: "Get players who have played this hero",
        tags: ["heroes"],
        parameters: [{ $ref: "#/components/parameters/heroIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/PlayerObjectResponse",
                    },
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/players",
        func: async (req, res, next) => {
          const heroId = req.params.hero_id;
          const { rows } = await db.raw(
            `SELECT
            account_id,
            count(match_id) games_played,
            sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN player_matches using(match_id)
            WHERE player_matches.hero_id = ?
            GROUP BY account_id
            ORDER BY games_played DESC`,
            [heroId],
          );
          return res.json(rows);
        },
      },
    },
    "/heroes/{hero_id}/itemPopularity": {
      get: {
        operationId: generateOperationId(
          "get",
          "/heroes/{hero_id}/itemPopularity",
        ),
        summary: "GET /heroes/{hero_id}/itemPopularity",
        description:
          "Get item popularity of hero categoried by start, early, mid and late game, analyzed from professional games",
        tags: ["heroes"],
        parameters: [{ $ref: "#/components/parameters/heroIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/HeroItemPopularityResponse",
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/itemPopularity",
        func: async (req, res, next) => {
          const heroId = req.params.hero_id;
          const result = await getHeroItemPopularity(heroId);
          return res.json(result);
        },
      },
    },
    "/leagues": {
      get: {
        operationId: generateOperationId("get", "/leagues"),
        summary: "GET /leagues",
        description: "Get league data",
        tags: ["leagues"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/LeagueObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/leagues",
        func: async (req, res, next) => {
          const result = await db.select().from("leagues");
          return res.json(result);
        },
      },
    },
    "/leagues/{league_id}": {
      get: {
        operationId: generateOperationId("get", "/leagues/{league_id}"),
        summary: "GET /leagues/{league_id}",
        description: "Get data for a league",
        tags: ["leagues"],
        parameters: [{ $ref: "#/components/parameters/leagueIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/LeagueObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT leagues.*
            FROM leagues
            WHERE leagues.leagueid = ?`,
            [req.params.league_id],
          );
          return res.json(rows[0]);
        },
      },
    },
    "/leagues/{league_id}/matches": {
      get: {
        operationId: generateOperationId("get", "/leagues/{league_id}/matches"),
        summary: "GET /leagues/{league_id}/matches",
        description: "Get matches for a league (excluding amateur leagues)",
        tags: ["leagues"],
        parameters: [{ $ref: "#/components/parameters/leagueIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/MatchObjectResponse",
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id/matches",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT match_id, radiant_win, start_time, duration, leagueid, radiant_score, dire_score, radiant_team_id, radiant_team_name, dire_team_id, dire_team_name, series_id, series_type
            FROM matches
            WHERE matches.leagueid = ?
            ORDER BY match_id DESC`,
            [req.params.league_id],
          );
          return res.json(rows);
        },
      },
    },
    "/leagues/{league_id}/matchIds": {
      get: {
        operationId: generateOperationId(
          "get",
          "/leagues/{league_id}/matchIds",
        ),
        summary: "GET /leagues/{league_id}/matchIds",
        description: "Get match IDs for a league (including amateur leagues)",
        tags: ["leagues"],
        parameters: [{ $ref: "#/components/parameters/leagueIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id/matchIds",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT match_id
            FROM league_match
            WHERE league_match.leagueid = ?
            ORDER BY match_id DESC`,
            [req.params.league_id],
          );
          return res.json(rows.map((r: any) => r.match_id));
        },
      },
    },
    "/leagues/{league_id}/teams": {
      get: {
        operationId: generateOperationId("get", "/leagues/{league_id}/teams"),
        summary: "GET /leagues/{league_id}/teams",
        description: "Get teams for a league",
        tags: ["leagues"],
        parameters: [{ $ref: "#/components/parameters/leagueIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/TeamObjectResponse",
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id/teams",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT team_rating.*, teams.*
            FROM matches
            LEFT JOIN team_match using(match_id)
            LEFT JOIN teams using(team_id)
            LEFT JOIN team_rating using(team_id)
            WHERE matches.leagueid = ?
            GROUP BY (teams.team_id, team_rating.team_id)`,
            [req.params.league_id],
          );
          return res.json(rows);
        },
      },
    },
    "/teams": {
      get: {
        operationId: generateOperationId("get", "/teams"),
        summary: "GET /teams",
        description: "Get team data",
        tags: ["teams"],
        parameters: [
          {
            name: "page",
            in: "query",
            description:
              "Page number, zero indexed. Each page returns up to 1000 entries.",
            required: false,
            schema: {
              type: "integer",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/TeamObjectResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/teams",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT team_rating.*, teams.*
            FROM teams
            LEFT JOIN team_rating using(team_id)
            ORDER BY rating desc NULLS LAST
            LIMIT 1000
            OFFSET ?`,
            [(Number(req.query.page) || 0) * 1000],
          );
          return res.json(rows);
        },
      },
    },
    "/teams/{team_id}": {
      get: {
        operationId: generateOperationId("get", "/teams/{team_id}"),
        summary: "GET /teams/{team_id}",
        description: "Get data for a team",
        tags: ["teams"],
        parameters: [{ $ref: "#/components/parameters/teamIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/TeamObjectResponse",
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT team_rating.*, teams.*
            FROM teams
            LEFT JOIN team_rating using(team_id)
            WHERE teams.team_id = ?`,
            [req.params.team_id],
          );
          return res.json(rows[0]);
        },
      },
    },
    "/teams/{team_id}/matches": {
      get: {
        operationId: generateOperationId("get", "/teams/{team_id}/matches"),
        summary: "GET /teams/{team_id}/matches",
        description: "Get matches for a team",
        tags: ["teams"],
        parameters: [{ $ref: "#/components/parameters/teamIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/TeamMatchObjectResponse",
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/matches",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `
            SELECT team_match.match_id, radiant_win, radiant_score, dire_score, team_match.radiant, duration, start_time, leagueid, leagues.name as league_name, cluster, tm2.team_id opposing_team_id, teams2.name opposing_team_name, teams2.logo_url opposing_team_logo
            FROM team_match
            JOIN matches USING(match_id)
            JOIN leagues USING(leagueid)
            JOIN team_match tm2 on team_match.match_id = tm2.match_id and team_match.team_id != tm2.team_id
            JOIN teams teams2 on tm2.team_id = teams2.team_id
            WHERE team_match.team_id = ?
            ORDER BY match_id DESC
            `,
            [req.params.team_id],
          );
          return res.json(rows);
        },
      },
    },
    "/teams/{team_id}/players": {
      get: {
        operationId: generateOperationId("get", "/teams/{team_id}/players"),
        summary: "GET /teams/{team_id}/players",
        description: "Get players who have played for a team",
        tags: ["teams"],
        parameters: [{ $ref: "#/components/parameters/teamIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/TeamPlayersResponse",
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/players",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT account_id, notable_players.name, count(matches.match_id) games_played, sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins, notable_players.team_id = teams.team_id is_current_team_member
            FROM matches
            JOIN team_match USING(match_id)
            JOIN player_matches ON player_matches.match_id = matches.match_id AND team_match.radiant = (player_matches.player_slot < 128)
            JOIN teams USING (team_id)
            LEFT JOIN notable_players USING(account_id)
            WHERE teams.team_id = ?
            GROUP BY account_id, notable_players.name, notable_players.team_id, teams.team_id
            ORDER BY games_played DESC`,
            [req.params.team_id],
          );
          return res.json(rows);
        },
      },
    },
    "/teams/{team_id}/heroes": {
      get: {
        operationId: generateOperationId("get", "/teams/{team_id}/heroes"),
        summary: "GET /teams/{team_id}/heroes",
        description: "Get heroes for a team",
        tags: ["teams"],
        parameters: [{ $ref: "#/components/parameters/teamIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/TeamHeroesResponse",
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/heroes",
        func: async (req, res, next) => {
          const { rows } = await db.raw(
            `SELECT hero_id, localized_name, count(matches.match_id) games_played, sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN team_match USING(match_id)
            JOIN player_matches ON player_matches.match_id = matches.match_id AND team_match.radiant = (player_matches.player_slot < 128)
            JOIN teams USING(team_id)
            LEFT JOIN heroes ON player_matches.hero_id = heroes.id
            WHERE teams.team_id = ?
            GROUP BY hero_id, localized_name
            ORDER BY games_played DESC`,
            [req.params.team_id],
          );
          return res.json(rows);
        },
      },
    },
    "/records/{field}": {
      get: {
        operationId: generateOperationId("get", "/records/{field}"),
        summary: "GET /records/{field}",
        description: "Get top performances in a stat",
        tags: ["records"],
        parameters: [
          {
            name: "field",
            in: "path",
            description: "Field name to query",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/RecordsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/records/:field",
        func: async (req, res, next) => {
          const rows = await redis.zrevrange(
            `records:${req.params.field}`,
            0,
            99,
            "WITHSCORES",
          );
          const entries = rows
            ?.map((r, i) => {
              const match_id = parseInt(r.split(":")[0]);
              const start_time = parseInt(r.split(":")[1]);
              const hero_id = parseInt(r.split(":")[2]);
              const score = parseInt(rows[i + 1]);
              return {
                match_id: Number.isNaN(match_id) ? null : match_id,
                start_time: Number.isNaN(start_time) ? null : start_time,
                hero_id: Number.isNaN(hero_id) ? null : hero_id,
                score: Number.isNaN(score) ? null : score,
              };
            })
            .filter((r, i) => i % 2 === 0);
          return res.json(entries);
        },
      },
    },
    "/live": {
      get: {
        operationId: generateOperationId("get", "/live"),
        summary: "GET /live",
        description: "Get top currently ongoing live games",
        tags: ["live"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    title: "LiveResponse",
                    type: "object",
                    properties: {},
                  },
                },
              },
            },
          },
        },
        route: () => "/live",
        func: async (req, res, next) => {
          const games = await redis.zrangebyscore("liveGames", "-inf", "inf");
          if (!games?.length) {
            return res.json(games);
          }
          const keys = games.map((r) => `liveGame:${r}`);
          const blobs = await redis.mget(keys);
          return res.json(blobs.map((r) => (r ? JSON.parse(r) : null)));
        },
      },
    },
    "/scenarios/itemTimings": {
      get: {
        operationId: generateOperationId("get", "/scenarios/itemTimings"),
        summary: "GET /scenarios/itemTimings",
        description:
          "Win rates for certain item timings on a hero for items that cost at least 1400 gold",
        tags: ["scenarios"],
        parameters: [
          {
            name: "item",
            in: "query",
            description: 'Filter by item name e.g. "spirit_vessel"',
            required: false,
            schema: {
              type: "string",
            },
          },
          { $ref: "#/components/parameters/heroIdParam" },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ScenarioItemTimingsResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/itemTimings",
        func: async (req, res, next) => {
          const result = await getItemTimings(req);
          return res.json(result);
        },
      },
    },
    "/scenarios/laneRoles": {
      get: {
        operationId: generateOperationId("get", "/scenarios/laneRoles"),
        summary: "GET /scenarios/laneRoles",
        description: "Win rates for heroes in certain lane roles",
        tags: ["scenarios"],
        parameters: [
          {
            name: "lane_role",
            in: "query",
            description: "Filter by lane role 1-4 (Safe, Mid, Off, Jungle)",
            required: false,
            schema: {
              type: "string",
            },
          },
          { $ref: "#/components/parameters/heroIdParam" },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ScenarioLaneRolesResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/laneRoles",
        func: async (req, res, next) => {
          const result = await getLaneRoles(req);
          return res.json(result);
        },
      },
    },
    "/scenarios/misc": {
      get: {
        operationId: generateOperationId("get", "/scenarios/misc"),
        summary: "GET /scenarios/misc",
        description: "Miscellaneous team scenarios",
        tags: ["scenarios"],
        parameters: [{ $ref: "#/components/parameters/scenarioParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/ScenarioMiscResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/misc",
        func: async (req, res, next) => {
          const result = await getTeamScenarios(req);
          return res.json(result);
        },
      },
    },
    "/schema": {
      get: {
        operationId: generateOperationId("get", "/schema"),
        summary: "GET /schema",
        description: "Get database schema",
        tags: ["schema"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/SchemaResponse",
                  },
                },
              },
            },
          },
        },
        route: () => "/schema",
        func: async (req, res, next) => {
          const result = await db
            .select(["table_name", "column_name", "data_type"])
            .from("information_schema.columns")
            .where({
              table_schema: "public",
            });
          return res.json(result);
        },
      },
    },
    "/constants/{resource}": {
      get: {
        operationId: generateOperationId("get", "/constants/{resource}"),
        summary: "GET /constants",
        description:
          "Get static game data mirrored from the dotaconstants repository.",
        tags: ["constants"],
        parameters: [
          {
            name: "resource",
            in: "path",
            description:
              "Resource name e.g. `heroes`. [List of resources](https://github.com/odota/dotaconstants/tree/master/build)",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  nullable: true,
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: {
                        title: "ConstantResourceResponse",
                      },
                    },
                    {
                      type: "array",
                      items: {
                        oneOf: [
                          {
                            type: "object",
                            additionalProperties: {
                              title: "ConstantResourceResponse",
                            },
                          },
                          {
                            type: "integer",
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        route: () => "/constants/{:resource}",
        func: async (req, res, next) => {
          const { resource } = req.params;
          const resp = constants[resource as keyof typeof constants];
          if (resp) {
            return res.json(resp);
          }
          return next();
        },
      },
    },
  },
};
export default spec;
