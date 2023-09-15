const constants = require("dotaconstants");
const moment = require("moment");
const { Client } = require("pg");
const config = require("../config");
// const crypto = require("crypto");
// const uuidV4 = require("uuid/v4");
const queue = require("../store/queue");
const queries = require("../store/queries");
const search = require("../store/search");
const searchES = require("../store/searchES");
const buildStatus = require("../store/buildStatus");
// const getGcData = require("../util/getGcData");
const utility = require("../util/utility");
const db = require("../store/db");
const redis = require("../store/redis");
const packageJson = require("../package.json");
const params = require("./requests/importParams");
const responses = require("./responses/schemas/importResponseSchemas");
const generateOperationId = require("./generateOperationId");
const matchesHandler = require("./handlers/matches")
const playersHandler = require("./handlers/players");
const heroesHandler = require("./handlers/heroes");

const { redisCount, matchupToString } = utility;

const parameters = Object.values(params).reduce(
  (acc, category) => ({ ...acc, ...category }),
  {}
);

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

const playerParams = playerParamNames.map((paramName) => ({
  $ref: `#/components/parameters/${paramName}`,
}));

const schemas = Object.values(responses).reduce(
  (acc, category) => ({ ...acc, ...category }),
  {}
);

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

const spec = {
  openapi: "3.0.3",
  info: {
    title: "OpenDota API",
    description: `# Introduction
The OpenDota API provides Dota 2 related data including advanced match data extracted from match replays.

You can find data that can be used to convert hero and ability IDs and other information provided by the API from the [dotaconstants](https://github.com/odota/dotaconstants) repository.

The OpenDota API offers 50,000 free calls per month and a rate limit of 60 requests/minute. We also offer a Premium Tier with unlimited API calls and higher rate limits. Check out the [API page](https://www.opendota.com/api-keys) to learn more.
    `,
    version: packageJson.version,
  },
  servers: [
    {
      url: "https://api.opendota.com/api",
    },
  ],
  components: {
    securitySchemes: securitySchemes,
    schemas: schemas,
    parameters: parameters,
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
        route: () => "/matches/:match_id/:info?",
        func: matchesHandler.getMatchById,
      },
    },
    "/playersByRank": {
      get: {
        operationId: generateOperationId("get", "/playersByRank"),
        summary: "GET /playersByRank",
        description: "Players ordered by rank/medal tier",
        tags: ["playersByRank"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: "#/components/schemas/PlayersByRankResponse",
                },
              },
            },
          },
        },
        route: () => "/playersByRank",
        func: playersHandler.getPlayersByRank,
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
        func: playersHandler.getPlayersByAccountId,
      },
    },
    "/players/{account_id}/wl": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/wl"),
        summary: "GET /players/{account_id}/wl",
        description: "Win/Loss count",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/PlayerWinLossResponse`,
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wl",
        func: playersHandler.getPlayersByAccountIdWl,
      },
    },
    "/players/{account_id}/recentMatches": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/recentMatches"
        ),
        summary: "GET /players/{account_id}/recentMatches",
        description: "Recent matches played",
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
        func: playersHandler.getPlayersByAccountIdRecentMatches,
      },
    },
    "/players/{account_id}/matches": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/matches"
        ),
        summary: "GET /players/{account_id}/matches",
        description: "Matches played",
        tags: ["players"],
        parameters: [
          ...playerParams,
          {
            $ref: `#/components/parameters/projectParam`,
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
                    $ref: `#/components/schemas/PlayerMatchesResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/matches",
        func: playersHandler.getPlayersByAccountIdMatches,
      },
    },
    "/players/{account_id}/heroes": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/heroes"),
        summary: "GET /players/{account_id}/heroes",
        description: "Heroes played",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PlayerHeroesResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/heroes",
        func: playersHandler.getPlayersByAccountIdHeroes,
      },
    },
    "/players/{account_id}/peers": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/peers"),
        summary: "GET /players/{account_id}/peers",
        description: "Players played with",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PlayerPeersResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/peers",
        func: playersHandler.getPlayersByAccountIdPeers,
      },
    },
    "/players/{account_id}/pros": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/pros"),
        summary: "GET /players/{account_id}/pros",
        description: "Pro players played with",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PlayerProsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/pros",
        func: playersHandler.getPlayersByAccountIdPros,
      },
    },
    "/players/{account_id}/totals": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/totals"),
        summary: "GET /players/{account_id}/totals",
        description: "Totals in stats",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PlayerTotalsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/totals",
        func: playersHandler.getPlayersByAccountIdTotals,
      },
    },
    "/players/{account_id}/counts": {
      get: {
        operationId: generateOperationId("get", "/players/{account_id}/counts"),
        summary: "GET /players/{account_id}/counts",
        description: "Counts in categories",
        tags: ["players"],
        parameters: playerParams,
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
        func: playersHandler.getPlayersByAccountIdCounts,
      },
    },
    "/players/{account_id}/histograms/{field}": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/histograms/{field}"
        ),
        summary: "GET /players/{account_id}/histograms",
        description: "Distribution of matches in a single stat",
        tags: ["players"],
        parameters: [
          ...playerParams,
          {
            $ref: `#/components/parameters/fieldParam`,
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
        func: playersHandler.getPlayersByAccountIdHistogramsByField,
      },
    },
    "/players/{account_id}/wardmap": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/wardmap"
        ),
        summary: "GET /players/{account_id}/wardmap",
        description: "Wards placed in matches played",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/PlayerWardMapResponse`,
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wardmap",
        func: playersHandler.getPlayersByAccountIdWardMap,
      },
    },
    "/players/{account_id}/wordcloud": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/wordcloud"
        ),
        summary: "GET /players/{account_id}/wordcloud",
        description: "Words said/read in matches played",
        tags: ["players"],
        parameters: playerParams,
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/PlayerWordCloudResponse`,
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/wordcloud",
        func: playersHandler.getPlayersByAccountIdWordCloud,
      },
    },
    "/players/{account_id}/ratings": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/ratings"
        ),
        summary: "GET /players/{account_id}/ratings",
        description: "Player rating history",
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
                    $ref: `#/components/schemas/PlayerRatingsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/ratings",
        func: playersHandler.getPlayersByAccountIdRatings,
      },
    },
    "/players/{account_id}/rankings": {
      get: {
        operationId: generateOperationId(
          "get",
          "/players/{account_id}/rankings"
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
        func: playersHandler.getPlayersByAccountIdRankings,
      },
    },
    "/players/{account_id}/refresh": {
      post: {
        summary: "POST /players/{account_id}/refresh",
        description: "Refresh player match history",
        tags: ["players"],
        parameters: [{ $ref: "#/components/parameters/accountIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "PlayerRefreshResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/players/:account_id/refresh",
        func: playersHandler.getPlayersByAccountIdRefresh,
      },
    },
    "/proPlayers": {
      get: {
        operationId: generateOperationId("get", "/proPlayers"),
        summary: "GET /proPlayers",
        description: "Get list of pro players",
        tags: ["pro players"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PlayerObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/proPlayers",
        func: playersHandler.getProPlayers,
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
                    $ref: `#/components/schemas/MatchObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/proMatches",
        func: matchesHandler.getProMatches,
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
          { $ref: "#/components/parameters/mmrAscendingParam" },
          { $ref: "#/components/parameters/mmrDescendingParam" },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/PublicMatchesResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/publicMatches",
        func: matchesHandler.getPublicMatches,
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
                    $ref: `#/components/schemas/ParsedMatchesResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/parsedMatches",
        func: matchesHandler.getParsedMatches,
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
          // TODO handle NQL (@nicholashh query language)
          const input = req.query.sql;
          const client = new Client({
            connectionString: config.READONLY_POSTGRES_URL,
            statement_timeout: 10000,
          });
          client.connect();
          let result = null;
          let err = null;
          try {
            result = await client.query(input);
          } catch (e) {
            err = e;
          }
          client.end();
          const final = Object.assign({}, result, {
            err: err && err.toString(),
          });
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
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/MetadataResponse`,
                },
              },
            },
          },
        },
        route: () => "/metadata",
        func: (req, res, cb) => {
          queries.getMetadata(req, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    "/distributions": {
      get: {
        operationId: generateOperationId("get", "/distributions"),
        summary: "GET /distributions",
        description: "Distributions of MMR data by bracket and country",
        tags: ["distributions"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/DistributionsResponse`,
                },
              },
            },
          },
        },
        route: () => "/distributions",
        func: (req, res, cb) => {
          queries.getDistributions(redis, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
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
                    $ref: `#/components/schemas/SearchResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/search",
        func: playersHandler.searchPlayers,
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
              type: "string", //todo: String for hero id?
            },
          },
        ],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/RankingsResponse`,
                },
              },
            },
          },
        },
        route: () => "/rankings",
        func: heroesHandler.getHeroRankings,
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
                  $ref: `#/components/schemas/BenchmarksResponse`,
                },
              },
            },
          },
        },
        route: () => "/benchmarks",
        func: heroesHandler.getHeroBenchmarks,
      },
    },
    "/status": {
      get: {
        operationId: generateOperationId("get", "/status"),
        summary: "GET /status",
        description: "Get current service statistics",
        tags: ["status"],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  title: "StatusResponse",
                  type: "object",
                },
              },
            },
          },
        },
        route: () => "/status",
        func: (req, res, cb) => {
          buildStatus(db, redis, (err, status) => {
            if (err) {
              return cb(err);
            }
            return res.json(status);
          });
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
        route: () => "/health/:metric?",
        func: (req, res, cb) => {
          redis.hgetall("health", (err, result) => {
            if (err) {
              return cb(err);
            }
            const response = result || {};
            Object.keys(response).forEach((key) => {
              response[key] = JSON.parse(response[key]);
            });
            if (!req.params.metric) {
              return res.json(response);
            }
            const single = response[req.params.metric];
            const healthy = single.metric < single.threshold;
            return res.status(healthy ? 200 : 500).json(single);
          });
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
        func: (req, res, cb) => {
          queue.getJob(req.params.jobId, (err, job) => {
            if (err) {
              return cb(err);
            }
            if (job) {
              return res.json(
                Object.assign({}, job, {
                  jobId: job.id,
                })
              );
            }
            return res.json(null);
          });
        },
      },
    },
    "/request/{match_id}": {
      post: {
        summary: "POST /request/{match_id}",
        description: "Submit a new parse request",
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
        func: (req, res) => {
          const matchId = req.params.match_id;
          const match = {
            match_id: Number(matchId),
          };
          function exitWithJob(err, parseJob) {
            if (err) {
              console.error(err);
            }
            res.status(err ? 400 : 200).json({
              job: {
                jobId: parseJob && parseJob.id,
              },
            });
          }
          if (match && match.match_id) {
            // match id request, get data from API
            return utility.getData(
              utility.generateJob("api_details", match).url,
              (err, body) => {
                if (err) {
                  // couldn't get data from api, non-retryable
                  return exitWithJob(JSON.stringify(err));
                }
                // Count this request
                redisCount(redis, "request");
                // match details response
                const match = body.result;
                return queries.insertMatch(
                  match,
                  {
                    type: "api",
                    attempts: 1,
                    priority: 1,
                    forceParse: true,
                  },
                  exitWithJob
                );
              }
            );
          }
          return exitWithJob("invalid input");
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
        func: matchesHandler.findMatches,
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
                    $ref: `#/components/schemas/HeroObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes",
        func: heroesHandler.getHeroData,
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
                    $ref: `#/components/schemas/HeroStatsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/heroStats",
        func: heroesHandler.getHeroStats,
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
                    $ref: `#/components/schemas/MatchObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/matches",
        func: heroesHandler.getRecentMatchesByHeroId
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
                    $ref: `#/components/schemas/HeroMatchupsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/matchups",
        func: (req, res, cb) => {
          const heroId = req.params.hero_id;
          db.raw(
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
            [heroId, moment().subtract(1, "year").format("X")]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                    $ref: `#/components/schemas/HeroDurationsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/durations",
        func: (req, res, cb) => {
          const heroId = req.params.hero_id;
          db.raw(
            `SELECT
            (matches.duration / 300 * 300) duration_bin,
            count(match_id) games_played,
            sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN player_matches using(match_id)
            WHERE player_matches.hero_id = ?
            GROUP BY (matches.duration / 300 * 300)`,
            [heroId]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                    type: "array", //todo: Why double array?
                    items: {
                      $ref: `#/components/schemas/PlayerObjectResponse`,
                    },
                  },
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/players",
        func: (req, res, cb) => {
          const heroId = req.params.hero_id;
          db.raw(
            `SELECT
            account_id,
            count(match_id) games_played,
            sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN player_matches using(match_id)
            WHERE player_matches.hero_id = ?
            GROUP BY account_id
            ORDER BY games_played DESC`,
            [heroId]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
        },
      },
    },
    "/heroes/{hero_id}/itemPopularity": {
      get: {
        operationId: generateOperationId(
          "get",
          "/heroes/{hero_id}/itemPopularity"
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
                  $ref: `#/components/schemas/HeroItemPopularityResponse`,
                },
              },
            },
          },
        },
        route: () => "/heroes/:hero_id/itemPopularity",
        func: (req, res, cb) => {
          const heroId = req.params.hero_id;
          queries.getHeroItemPopularity(
            db,
            redis,
            heroId,
            {},
            (err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            }
          );
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
                    $ref: `#/components/schemas/LeagueObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/leagues",
        func: (req, res, cb) => {
          db.select()
            .from("leagues")
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
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
                    $ref: `#/components/schemas/LeagueObjectResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id",
        func: (req, res, cb) => {
          db.raw(
            `SELECT leagues.*
            FROM leagues
            WHERE leagues.leagueid = ?`,
            [req.params.league_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows[0]);
          });
        },
      },
    },
    "/leagues/{league_id}/matches": {
      get: {
        operationId: generateOperationId("get", "/leagues/{league_id}/matches"),
        summary: "GET /leagues/{league_id}/matches",
        description: "Get matches for a team",
        tags: ["leagues"],
        parameters: [{ $ref: "#/components/parameters/leagueIdPathParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  $ref: `#/components/schemas/MatchObjectResponse`,
                },
              },
            },
          },
        },
        route: () => "/leagues/:league_id/matches",
        func: (req, res, cb) => {
          db.raw(
            `SELECT matches.*
            FROM matches
            WHERE matches.leagueid = ?`,
            [req.params.league_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
        func: (req, res, cb) => {
          db.raw(
            `SELECT team_rating.*, teams.*
            FROM matches
            LEFT JOIN team_match using(match_id)
            LEFT JOIN teams using(team_id)
            LEFT JOIN team_rating using(team_id)
            WHERE matches.leagueid = ?
            GROUP BY (teams.team_id, team_rating.team_id)`,
            [req.params.league_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
        func: (req, res, cb) => {
          db.raw(
            `SELECT team_rating.*, teams.*
            FROM teams
            LEFT JOIN team_rating using(team_id)
            ORDER BY rating desc NULLS LAST
            LIMIT 1000
            OFFSET ?`,
            [(Number(req.query.page) || 0) * 1000]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
        func: (req, res, cb) => {
          db.raw(
            `SELECT team_rating.*, teams.*
            FROM teams
            LEFT JOIN team_rating using(team_id)
            WHERE teams.team_id = ?`,
            [req.params.team_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows[0]);
          });
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
                  $ref: `#/components/schemas/TeamMatchObjectResponse`,
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/matches",
        func: (req, res, cb) => {
          db.raw(
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
            [req.params.team_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                  $ref: `#/components/schemas/TeamPlayersResponse`,
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/players",
        func: (req, res, cb) => {
          db.raw(
            `SELECT account_id, notable_players.name, count(matches.match_id) games_played, sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins, notable_players.team_id = teams.team_id is_current_team_member
            FROM matches
            JOIN team_match USING(match_id)
            JOIN player_matches ON player_matches.match_id = matches.match_id AND team_match.radiant = (player_matches.player_slot < 128)
            JOIN teams USING (team_id)
            LEFT JOIN notable_players USING(account_id)
            WHERE teams.team_id = ?
            GROUP BY account_id, notable_players.name, notable_players.team_id, teams.team_id
            ORDER BY games_played DESC`,
            [req.params.team_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                  $ref: `#/components/schemas/TeamHeroesResponse`,
                },
              },
            },
          },
        },
        route: () => "/teams/:team_id/heroes",
        func: (req, res, cb) => {
          db.raw(
            `SELECT hero_id, localized_name, count(matches.match_id) games_played, sum(case when (player_matches.player_slot < 128) = matches.radiant_win then 1 else 0 end) wins
            FROM matches
            JOIN team_match USING(match_id)
            JOIN player_matches ON player_matches.match_id = matches.match_id AND team_match.radiant = (player_matches.player_slot < 128)
            JOIN teams USING(team_id)
            LEFT JOIN heroes ON player_matches.hero_id = heroes.id
            WHERE teams.team_id = ?
            GROUP BY hero_id, localized_name
            ORDER BY games_played DESC`,
            [req.params.team_id]
          ).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
        },
      },
    },
    "/replays": {
      get: {
        operationId: generateOperationId("get", "/replays"),
        summary: "GET /replays",
        description: "Get data to construct a replay URL with",
        tags: ["replays"],
        parameters: [{ $ref: "#/components/parameters/matchIdParam" }],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    $ref: `#/components/schemas/ReplaysResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/replays",
        func: (req, res, cb) => {
          db.select(["match_id", "cluster", "replay_salt"])
            .from("match_gcdata")
            .whereIn(
              "match_id",
              [].concat(req.query.match_id || []).slice(0, 5)
            )
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
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
                    $ref: `#/components/schemas/RecordsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/records/:field",
        func: (req, res, cb) => {
          redis.zrevrange(
            `records:${req.params.field}`,
            0,
            99,
            "WITHSCORES",
            (err, rows) => {
              if (err) {
                return cb(err);
              }
              const entries = rows
                .map((r, i) => {
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
            }
          );
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
        func: (req, res, cb) => {
          redis.zrangebyscore("liveGames", "-inf", "inf", (err, rows) => {
            if (err) {
              return cb(err);
            }
            if (!rows.length) {
              return res.json(rows);
            }
            const keys = rows.map((r) => `liveGame:${r}`);
            return redis.mget(keys, (err, rows) => {
              if (err) {
                return cb(err);
              }
              return res.json(rows.map((r) => JSON.parse(r)));
            });
          });
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
                    $ref: `#/components/schemas/ScenarioItemTimingsResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/itemTimings",
        func: (req, res, cb) => {
          queries.getItemTimings(req, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                    $ref: `#/components/schemas/ScenarioLaneRolesResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/laneRoles",
        func: (req, res, cb) => {
          queries.getLaneRoles(req, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                    $ref: `#/components/schemas/ScenarioMiscResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/scenarios/misc",
        func: (req, res, cb) => {
          queries.getTeamScenarios(req, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result.rows);
          });
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
                    $ref: `#/components/schemas/SchemaResponse`,
                  },
                },
              },
            },
          },
        },
        route: () => "/schema",
        func: (req, res, cb) => {
          db.select(["table_name", "column_name", "data_type"])
            .from("information_schema.columns")
            .where({
              table_schema: "public",
            })
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
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
        route: () => "/constants/:resource?",
        func: (req, res, cb) => {
          const { resource } = req.params;
          if (resource in constants) {
            return res.json(constants[resource]);
          }
          return cb();
        },
      },
    },
    "/constants": {
      get: {
        operationId: generateOperationId("get", "/constants"),
        summary: "GET /constants",
        description: "Gets an array of available resources.",
        tags: ["constants"],
        parameters: [],
        responses: {
          200: {
            description: "Success",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "array",
                  items: {
                    title: "ConstantsResponse",
                    type: "string",
                  },
                },
              },
            },
          },
        },
        route: () => "/constants",
        func: (req, res) => {
          return res.json(Object.keys(constants));
        },
      },
    },
  },
};
module.exports = spec;
