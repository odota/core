# OpenDota webhook API

## Introduction
OpenDota offers users the possibility to register webhooks, 
allowing you to get notified whenever a game gets detected and parsed.
Each subscription has to specify one or multiple criteria the webhook
is subscribing to. The available criteria are:

* Player ID (Dota2 account ID)
* League ID
* Team ID

You can subscribe to any combination of the above criteria and ofcourse,
multiple of the same ones. Each time a match is scanned or parsed that
contains a player, league, team whose ID you've subscribed to, the result
will get posted to your webhook. It has the same format a call to the 
`/matches` endpoint would get you, with an additional `origin` field
indicating whether the match was scanned or parsed. 

## Webhook management endpoints

In order to call any of the following endpoints, you must be authenticated.

### `/webhooks`

#### GET

Lists the ID's of all your registered webhooks

##### Example response body

```
[
  '78f70061-6ea7-488c-9829-ae3baa388e89',
  '130e8711-1224-44df-b193-4c2b06e9bbf0'
]
```

#### POST

Allows you to register a new webhook. You cannot register the same URL twice.
If you want to change a registered webhook, either update it or delete it.

##### Example request body

```
{
  "url": "https://gg.end",
  "subscriptions": {
    "players": ["19672354"],
    "teams": ["2586976", "2163", "39"]
  }
}
```

### `/webhooks/{webhook_id}`

#### GET

Returns the details of the webhook corresponding to the given ID

##### Example response body

```
{
  "url": "https://gg.end",
  "subscriptions": {
    "players": ["19672354"],
    "teams": ["2586976", "2163", "39"]
  }
}
```

#### PUT

Updates the subscriptions of the webhook corresponding to the given ID

##### Example request body

```
{
  "subscriptions": {
    "players": ["19672354"],
    "teams": ["2586976", "2163"]
  }
}
```

#### DELETE

Delete the webhook corresponding to the given ID