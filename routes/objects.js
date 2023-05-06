const playerObject = {
  type: "array",
  items: {
    title: "PlayerObjectResponse",
    type: "object",
    properties: {
      account_id: {
        description: "Player's account identifier",
        type: "integer",
      },
      steamid: {
        description: "Player's steam identifier",
        type: "string",
      },
      avatar: {
        description: "Steam picture URL (small picture)",
        type: "string",
      },
      avatarmedium: {
        description: "Steam picture URL (medium picture)",
        type: "string",
      },
      avatarfull: {
        description: "Steam picture URL (full picture)",
        type: "string",
      },
      profileurl: {
        description: "Steam profile URL",
        type: "string",
      },
      personaname: {
        description: "Player's Steam name",
        type: "string",
      },
      last_login: {
        description: "Date and time of last login to OpenDota",
        type: "string",
        format: "date-time",
      },
      full_history_time: {
        description:
          "Date and time of last request to refresh player's match history",
        type: "string",
        format: "date-time",
      },
      cheese: {
        description: "Amount of dollars the player has donated to OpenDota",
        type: "integer",
      },
      fh_unavailable: {
        description: "Whether the refresh of player' match history failed",
        type: "boolean",
      },
      loccountrycode: {
        description: "Player's country identifier, e.g. US",
        type: "string",
      },
      name: {
        description: "Verified player name, e.g. 'Miracle-'",
        type: "string",
      },
      country_code: {
        description: "Player's country code",
        type: "string",
      },
      fantasy_role: {
        description: "Player's ingame role (core: 1 or support: 2)",
        type: "integer",
      },
      team_id: {
        description: "Player's team identifier",
        type: "integer",
      },
      team_name: {
        description: "Player's team name, e.g. 'Evil Geniuses'",
        type: "string",
      },
      team_tag: {
        description: "Player's team shorthand tag, e.g. 'EG'",
        type: "string",
      },
      is_locked: {
        description: "Whether the roster lock is active",
        type: "boolean",
      },
      is_pro: {
        description: "Whether the player is professional or not",
        type: "boolean",
      },
      locked_until: {
        description: "When the roster lock will end",
        type: "integer",
      },
    },
  },
};
const leagueObject = {
  type: "array",
  items: {
    title: "LeagueObjectResponse",
    type: "object",
    properties: {
      leagueid: {
        description: "leagueid",
        type: "integer",
      },
      ticket: {
        description: "ticket",
        type: "string",
      },
      banner: {
        description: "banner",
        type: "string",
      },
      tier: {
        description: "tier",
        type: "string",
      },
      name: {
        description: "name",
        type: "string",
      },
    },
  },
};

module.exports = {
  matchObject,
  teamObject,
  heroObject,
  playerObject,
  leagueObject,
};
