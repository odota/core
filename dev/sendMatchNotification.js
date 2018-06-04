/* eslint-disable import/no-extraneous-dependencies */

const rewire = require('rewire');

const parser = rewire('../svc/parser.js');

const sendNotifications = parser.__get__('sendNotifications');

// Sends notification to all the account_ids in the pgroup object. Replace account_id with the account you're testing against.
const job = JSON.parse('{"match_id":3402873969,"radiant_win":true,"start_time":1503712159,"duration":2887,"pgroup":{"0":{"account_id":102344608,"hero_id":1,"player_slot":0},"1":{"account_id":null,"hero_id":40,"player_slot":1}},"ability_upgrades":[]}');

sendNotifications(job);
