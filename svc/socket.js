/** 
 * websocket server that recieves match data as it arrives and checks if
 * any connected clients are subscribed to match properties.
 **/
const config = require('../config')
const redis = require('redis');
const WebSocket = require('ws');
const uuidV1 = require('uuid/v1');
const db = require('../store/db');
const queries = require('../store/queries');
const getPlayer = queries.getPlayer;
const buildMatch = require('../store/buildMatch');
const async = require('async');

const anonymousID = require('../util/utility').getAnonymousAccountId();
const subTypes = ['player', 'team', 'league'];

const wss = new WebSocket.Server({
  port: 5000
});
const subclients = new Map();

// create a different redis client to subscribe to matches with
console.log('[SOCKET] connecting %s', config.REDIS_URL);
const redisClient = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
redisClient.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

class Subclient {
  constructor(ws, uuid) {
    this._ws = ws;
    this._uuid = uuid;
    this._subscriptions = {
      player: [],
      team: [],
      league: []
    };
  }

  get ws() { return this._ws; }
  get uuid() { return this._uuid; }
  get player() { return this._subscriptions.player; }
  get team() { return this._subscriptions.team; }
  get league() { return this._subscriptions.league; }
  get subscriptions() { return this._subscriptions; }

  // send data to this websocket
  send(data, nonce) {
    return new Promise((resolve, reject) => {
      data.nonce = nonce || null;
      this._ws.send(JSON.stringify(data), (err) => {
        if (err) reject(err);
        resolve();
      });
    });
  }

  // given a match or partial match, 
  // check if this websocket is subscribed to any of the paramaters.
  checkMatch(match, origin) {
    let found = {
      matches: 0,
      player: [],
      team: [],
      league: []
    };
    match.players.forEach(player => {
      // how 2 even hecking do this
      if (~this._subscriptions.player.indexOf(player.account_id) && player.account_id != anonymousID) {
        found.matches += 1;
        found.player.push(player.account_id);
      }
    });
    if (~this._subscriptions.team.indexOf(match.radiant_team_id)) {
      found.matches += 1;
      found.team.push(match.radiant_team_id);
    }
    if (~this._subscriptions.team.indexOf(match.dire_team_id)) {
      found.matches += 1;
      found.team.push(match.dire_team_id);
    }
    if (~this._subscriptions.league.indexOf(match.leagueid)) {
      found.matches += 1;
      found.league.push(match.leagueid);
    }
    if (found.matches) {
      buildMatch(match.match_id, (err, matchData) => {
        if (err) {
          console.error(`[SCANNER] couldn't get matchData for matchid ${match.match_id}`);
          console.error(err);
        } else {
          this.send({
            type: 'MATCH',
            message: {
              found,
              origin,
              match: matchData
            }
          }).catch(err => {
            console.error(`[SOCKET] couldn't send match ${match.match_id} to ${this._uuid}`);
            console.error(err);
          });
        }
      });
    }
  }
}

const handlers = {
  PING: function(ctx, data) {
    return ctx.send({
      type: 'PONG',
      message: { date: Date.now() }
    }, data.nonce);
  },
  SUBSCRIBE: function(ctx, data) {
    // check if we can subscribe to this type of id
    if (!~subTypes.indexOf(data.message.type)) {
      return ctx.send({
        type: 'SUBSCRIBE_NAK',
        message: { err: `Incorrect subscribe type provided. No IDs subscribed to. Available types: ${subTypes.join(', ')}` }
      }, data.nonce);
    }
    // check if there are ids
    if (data.message.ids === undefined) {
      return ctx.send({  
        type: 'SUBSCRIBE_NAK',
        message: { err: 'No IDs provided. Nothing to subscribe to.' }
      }, data.nonce);
    }
    // check if the ids are an array, otherwise create one
    if (!Array.isArray(data.message.ids)) {
      if (typeof data.message.ids === 'string' || typeof data.message.ids === 'number') {
        data.message.ids = [ data.message.ids ];
      }
    }
    // if its a player, verify the player has an opendota account
    if (data.message.type === 'player') {
      return async.map(data.message.ids, (id, cb) => {
        getPlayer(db, id, cb);
      }, (err, results) => {
        if (err) {
          return ctx.send({
            type: 'SUBSCRIBE_NAK',
            message: {
              err: 'Error checking status of players.',
              dberror: err
            }
          }, data.nonce);
        } else {
          // then sub to it
          if (results.every(result => result && result.account_id)) {
            ctx._subscriptions.player.push(...data.message.ids);
            ctx._subscriptions.player = ctx._subscriptions.player.filter((ele, index, array) => array.indexOf(ele) === index);
            return ctx.send({
              type: 'SUBSCRIBE_ACK',
              message: {
                type: 'player',
                ids: ctx._subscriptions.player
              }
            }, data.nonce);
          // or don't
          } else {
            return ctx.send({
              type: 'SUBSCRIBE_NAK',
              message: {
                err: 'One or more player IDs provided are not registered with OpenDota.'
              }
            }, data.nonce);
          }
        }
      });
    // if not, just sub to it
    } else {
      ctx._subscriptions[data.message.type].push(...data.message.ids);
      ctx._subscriptions[data.message.type] = ctx._subscriptions[data.message.type].filter((ele, index, array) => array.indexOf(ele) === index);
      return ctx.send({
        type: 'SUBSCRIBE_ACK',
        message: {
          type: data.message.type,
          ids: ctx._subscriptions[data.message.type]
        }
      }, data.nonce);
    }
  },
  UNSUBSCRIBE: function(ctx, data) {
    // check if we can unsubcribe from this type of id
    if (!~subTypes.indexOf(data.message.type)) {
      return ctx.send({
        type: 'UNSUBSCRIBE_NAK',
        message: { err: `Incorrect subscribe type provided. No IDs unsubscribed from. Available types: ${subTypes.join(', ')}` }
      }, data.nonce);
    }
    // check if there are ids to unsubscribe from
    if (data.message.ids === undefined) {
      return ctx.send({  
        type: 'UNSUBSCRIBE_NAK',
        message: { err: 'No IDs provided. Nothing to unsubscribe from.' }
      }, data.nonce);
    }
    // check if the ids are an array, otherwise create one
    if (!Array.isArray(data.message.ids)) {
      if (typeof data.message.ids === 'string' || typeof data.message.ids === 'number') {
        data.message.ids = [ data.message.ids ];
      }
    }
    // unsubscribe from each id
    let removed = [];
    for (id in data.message.ids) {
      removed.push(...ctx._subscriptions[data.message.type].splice(ctx._subscriptions[data.message.type].indexOf(id), 1));
    }
    return ctx.send({
      type: 'UNSUBSCRIBE_ACK',
      message: {
        type: data.message.type,
        ids: removed
      }
    });
  },
  GET_SUBS: function(ctx, data) {
    // just return every sub we have
    return ctx.send({
      type: 'GET_SUBS_ACK',
      message: ctx._subscriptions
    }, data.nonce);
  }
};

wss.on('connection', (ws) => {
  ws.on('close', (code, reason) => {
    console.log('[SOCKET] connection closed');
    if (ws.uuid) console.log(`[SOCKET] uuid: ${ws.uuid}`);
    console.log(`[SOCKET] code: ${code}, reason: ${reason}`);

    if (subclients.get(ws.uuid)) {
      subclients.delete(ws.uuid);
      console.log(`[SOCKET] deleted ${ws.uuid}`);
    }
  });
  ws.on('message', (data) => {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (err) {
        console.log('[SOCKET] error parsing something');
        return;
      }
    }

    if (!data.type) {
      return ws.send({
        type: 'NAK',
        message: {
          err: 'BAD REQUEST: No message type provided'
        }
      }, (err) => {
        if (err) {
          console.log('[SOCKET] error sending to ws');
          console.log(err);
        }
      });
    }

    if (data.type === 'IDENTIFY') {
      let uuid = uuidV1();
      ws.uuid = uuid;
      subclients.set(uuid, new Subclient(ws, uuid));
      let subc = subclients.get(uuid);
      subc.send({
        type: 'IDENTIFY',
        message: {
          uuid
        }
      }).then(() => {
        setTimeout(() => {
          if (!subc) return false;
          let subscribed = false;
          let subs = subc.subscriptions;
          for (sub in subs) {
            if (subs[sub].length) subscribed = true;
          }
          if (!subscribed) subc.ws.close(1013, 'Not enough feeds subscribed to in the alotted time.');
        }, 15000);
      }).catch((err) => {
        console.log('[SOCKET] error sending to ws');
        console.log(err);
      });
    } else {
      if (!data.uuid) {
        return ws.send({
          type: 'NAK',
          message: {
            err: 'No UUID provided.'
          },
          nonce: data.nonce || null
        }, (err) => {
          if (err) {
            console.log('[SOCKET] error sending to ws');
            console.log(err);
          }
        });
      }
      if (handlers.hasOwnProperty(data.type)) {
        let subc = subclients.get(data.uuid);
        handlers[data.type](subc, data);
      } else {
        return ws.send({
          type: 'NAK',
          message: {
            err: 'Invalid request type specified.'
          }
        }, (err) => {
          if (err) {
            console.log('[SOCKET] error sending to ws');
            console.log(err);
          }
        });
      }
    }
  });
});

redisClient.on('message', (channel, message) => {
  message = JSON.parse(message);
  subclients.forEach((subc) => {
    subc.checkMatch(message, channel.split(':')[2]);
  });
});

wss.on('listening', () => {
  console.log('[SOCKET] server listening');
  redisClient.subscribe('socket:matches:scanner');
  redisClient.subscribe('socket:matches:parser');
});
