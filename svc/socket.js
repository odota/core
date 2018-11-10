/**
 * websocket server that recieves match data as it arrives and checks if
 * any connected clients are subscribed to match properties.
 * */
const redis = require('redis');
const WebSocket = require('ws');
const uuidV1 = require('uuid/v4');
const config = require('../config');

const subTypes = ['player', 'team', 'league'];

const wss = new WebSocket.Server({
  port: config.WEBSOCKET_PORT,
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
      league: [],
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
    data.nonce = nonce || null;
    this._ws.send(JSON.stringify(data), (err) => {
      if (err) {
        console.error(`[SOCKET] err sending to ws ${this._uuid}`);
        console.error(err);
      }
    });
  }

  // given a match or partial match,
  // check if this websocket is subscribed to any of the paramaters.
  checkMatch(match, origin) {
    const found = {
      matches: 0,
      player: [],
      team: [],
      league: [],
    };
    match.players.forEach((player) => {
      if (this._subscriptions.player.indexOf(Number(player.account_id)) !== -1) {
        found.matches += 1;
        found.player.push(player.account_id);
      }
    });
    if (this._subscriptions.team.indexOf(Number(match.radiant_team_id)) !== -1) {
      found.matches += 1;
      found.team.push(match.radiant_team_id);
    }
    if (this._subscriptions.team.indexOf(Number(match.dire_team_id)) !== -1) {
      found.matches += 1;
      found.team.push(match.dire_team_id);
    }
    if (this._subscriptions.league.indexOf(Number(match.leagueid)) !== -1) {
      found.matches += 1;
      found.league.push(match.leagueid);
    }
    if (found.matches) {
      this.send({
        type: 'MATCH',
        message: {
          found,
          origin,
          match,
        },
      });
    }
  }
}

const handlers = {
  PING(ctx, data) {
    return ctx.send({
      type: 'PONG',
      message: { date: Date.now() },
    }, data.nonce);
  },
  SUBSCRIBE(ctx, data) {
    // check if we can subscribe to this type of id
    if (subTypes.indexOf(data.message.type) === -1) {
      return ctx.send({
        type: 'SUBSCRIBE_NAK',
        message: { err: `Incorrect subscribe type provided. No IDs subscribed to. Available types: ${subTypes.join(', ')}` },
      }, data.nonce);
    }
    // check if there are ids
    if (data.message.ids === undefined) {
      return ctx.send({
        type: 'SUBSCRIBE_NAK',
        message: { err: 'No IDs provided. Nothing to subscribe to.' },
      }, data.nonce);
    }
    // check if the ids are an array, otherwise create one
    if (!Array.isArray(data.message.ids)) {
      data.message.ids = [data.message.ids];
    }
    ctx._subscriptions[data.message.type].push(...data.message.ids);
    ctx._subscriptions[data.message.type] = ctx._subscriptions[data.message.type]
      .filter((ele, index, array) => array.indexOf(ele) === index);
    return ctx.send({
      type: 'SUBSCRIBE_ACK',
      message: {
        type: data.message.type,
        ids: ctx._subscriptions[data.message.type],
      },
    }, data.nonce);
  },
  UNSUBSCRIBE(ctx, data) {
    // check if we can unsubcribe from this type of id
    if (subTypes.indexOf(data.message.type) === -1) {
      return ctx.send({
        type: 'UNSUBSCRIBE_NAK',
        message: { err: `Incorrect subscribe type provided. No IDs unsubscribed from. Available types: ${subTypes.join(', ')}` },
      }, data.nonce);
    }
    // check if there are ids to unsubscribe from
    if (data.message.ids === undefined) {
      return ctx.send({
        type: 'UNSUBSCRIBE_NAK',
        message: { err: 'No IDs provided. Nothing to unsubscribe from.' },
      }, data.nonce);
    }
    // check if the ids are an array, otherwise create one
    if (!Array.isArray(data.message.ids)) {
      data.message.ids = [data.message.ids];
    }
    // unsubscribe from each id
    const removed = [];
    data.message.ids.forEach((id) => {
      removed.push(...ctx._subscriptions[data.message.type]
        .splice(ctx._subscriptions[data.message.type].indexOf(id), 1));
    });
    return ctx.send({
      type: 'UNSUBSCRIBE_ACK',
      message: {
        type: data.message.type,
        ids: removed,
      },
    }, data.nonce);
  },
  GET_SUBS(ctx, data) {
    // just return every sub we have
    return ctx.send({
      type: 'GET_SUBS_ACK',
      message: ctx._subscriptions,
    }, data.nonce);
  },
};

wss.on('connection', (ws) => {
  ws.on('close', (code, reason) => {
    console.log('[SOCKET] connection closed');
    console.log(`[SOCKET] code: ${code}, reason: ${reason}`);

    if (subclients.get(ws.uuid)) {
      subclients.delete(ws.uuid);
      console.log(`[SOCKET] deleted ${ws.uuid}`);
    }
  });
  ws.on('message', (data) => {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        console.error('[SOCKET] error parsing something');
        console.error(data);
        return;
      }
    }

    if (!data.type) {
      ws.send(JSON.stringify({
        type: 'NAK',
        message: {
          err: 'BAD REQUEST: No message type provided',
        },
        nonce: data.nonce || null,
      }), (err) => {
        if (err) {
          console.error('[SOCKET] error sending to ws');
          console.error(err);
        }
      });
      return;
    }

    if (data.type === 'IDENTIFY') {
      const uuid = uuidV1();
      ws.uuid = uuid;
      subclients.set(uuid, new Subclient(ws, uuid));
      const subc = subclients.get(uuid);
      subc.send({
        type: 'IDENTIFY',
        message: {
          uuid,
        },
      }, data.nonce);
      setTimeout(() => {
        let subscribed = false;

        if (subc.player.length) subscribed = true;
        if (subc.team.length) subscribed = true;
        if (subc.league.length) subscribed = true;

        if (!subscribed) subc.ws.close(1013, 'Not enough feeds subscribed to in the alotted time.');
      }, 15000);
    } else {
      if (!data.uuid) {
        ws.send(JSON.stringify({
          type: 'NAK',
          message: {
            err: 'No UUID provided.',
          },
          nonce: data.nonce || null,
        }), (err) => {
          if (err) {
            console.error('[SOCKET] error sending to ws');
            console.error(err);
          }
        });
        return;
      }
      if (data.type in handlers) {
        const subc = subclients.get(data.uuid);
        if (subc) {
          handlers[data.type](subc, data);
        } else if (data.type === 'PING') {
          ws.send(JSON.stringify({
            type: 'PONG',
            message: {
              date: Date.now(),
              err: 'Invalid UUID provided.',
            },
            nonce: data.nonce || null,
          }), (err) => {
            if (err) {
              console.error('[SOCKET] error sending to ws');
              console.error(err);
            }
          });
        } else {
          ws.send(JSON.stringify({
            type: 'NAK',
            message: {
              err: 'Invalid UUID provided.',
            },
            nonce: data.nonce || null,
          }), (err) => {
            if (err) {
              console.error('[SOCKET] error sending to ws');
              console.error(err);
            }
          });
        }
      } else {
        ws.send(JSON.stringify({
          type: 'NAK',
          message: {
            err: 'Invalid request type specified.',
          },
          nonce: data.nonce || null,
        }), (err) => {
          if (err) {
            console.error('[SOCKET] error sending to ws');
            console.error(err);
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
