conn = new Mongo();
db = conn.getDB("dota");

//create test users
db.players.insert({account_id: 88367253, full_history:0})