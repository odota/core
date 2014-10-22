conn = new Mongo();
db = conn.getDB("dota");

db.players.drop();

//create test user
db.players.insert({account_id: 88367253, track:1, full_history:1})