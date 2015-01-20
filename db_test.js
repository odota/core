//create test user
db.players.update({account_id: 88367253},{$set:{account_id: 88367253, track:1, full_history:1}}, {upsert:true});
db.players.update({account_id: 84255420},{$set:{account_id: 84255420, track:1, full_history:1}}, {upsert:true});
