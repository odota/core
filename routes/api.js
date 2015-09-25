var express = require('express');
var api = express.Router();
var constants = require('../constants');
api.get('/items', function(req, res) {
    res.json(constants.items[req.query.name]);
});
api.get('/abilities', function(req, res) {
    res.json(constants.abilities[req.query.name]);
});
module.exports = api;