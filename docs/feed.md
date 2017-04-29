# Feed

Feed is a websocket service that allows users to connect and subscibe to live matches with various filters. These filters include account_id, team_id and leagueid. 

Connect to the service with the url `ws://feed.opendota.com:80/`.

## Message Format

The service communicates using JSON strings in a single websocket frame. Every request from the client to the server requires a UUID except for `IDENTIFY`.

```json
{
    "type": "PONG",
    "message": {
        "date": 1471145032000
    },
    "nonce": "2349872328979"
}
```
_an example pong message._

## Connecting

Acquiring a uuid is simple, just send an `IDENTIFY` packet and wait for a response:

```json
{
    "type": "IDENTIFY"
}
```
And recieve an `IDENTIFY` packet with your UUID in the message.
```json
{
    "type": "IDENTIFY",
    "message": {
        "uuid": "example uuid here"
    }
}
```
Do not share this UUID with anyone, as it will allow them to impersonate you and make requests to the server.

Upon connecting, if the client does not subscribe to anything within 15 seconds, they will be disconneted.

## Methods

After connecting, various methods will be available for your consumption. If provided with a nonce, the method will respond with that nonce. Every method except `PING` and `IDENTIFY` will respond with the method's name + `_ACK` or `_NAK` depending on the status of the transaction.

### PING

Send:
```json
{
    "type": "PING",
    "uuid": "example uuid here"
}
```
Recieve:
```json
{
    "type": "PONG",
    "message": {
        "date": "1376280737000"
    }
}
```

### SUBSCRIBE
To subscribe to a set of IDs, a type of ID must be provided. This can be either `player`, `team`, or `league`. The ID must be an integer, or must be able to be cast into an interger. Every successful subscription will reply with all the IDs you have subscribed to.

Send:
```json
{
    "type": "SUBSCRIBE",
    "uuid": "example uuid here",
    "message": {
        "type": "player",
        "ids": [86745912, 111620041, 87276347, 73562326, 25907144]
    },
    "nonce": "1234"
}
```
Recieve:
```json
{
    "type": "SUBSCRIBE_ACK",
    "message": {
        "type": "player",
        "ids": [86745912, 111620041, 87276347, 73562326, 25907144]
    },
    "nonce": "1234"
}
```

### UNSUBSCRIBE
Unsubscribing is similar to subscribing, in that you must provide `player`, `team`, or `league` as a type. The ID must be an integer, or must be able to be cast into an interger. The only difference is that the reply will be each ID you have unsubscribed from.

Send:
```json
{
    "type": "UNSUBSCRIBE",
    "uuid": "example uuid here",
    "message": {
        "type": "player",
        "ids": [86745912]
    },
    "nonce": "5678"
}
```
Recieve:
```json
{
    "type": "UNSUBSCRIBE_ACK",
    "message": {
        "type": "player",
        "ids": [86745912]
    },
    "nonce": "5678"
}
```

### GET_SUBS
Just returns every subscription that the client has subscribed to.

Send:
```json
{
    "type": "GET_SUBS",
    "uuid": "example uuid here",
    "message": {
        "type": "player",
        "ids": [86745912]
    },
    "nonce": "9012"
}
```
Recieve:
```json
{
    "type": "GET_SUBS_ACK",
    "message": {
        "player": [],
        "team": [],
        "league": []
    },
    "nonce": "9012"
}
```
