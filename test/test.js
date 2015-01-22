var request = require('supertest');
var assert = require('assert');
var utility = require('../utility')("mongodb://localhost/test");
var app = require("../app");
var client = utility.redis;
var db = utility.db;
var howard = {
  account_id: 88367253,
  track: 1,
  full_history: 1
};

//todo test all endpoints
//test for expected errs
describe('WEB', function() {
  it('GET /', function(done) {
    request(app)
      .get('/')
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /stats', function(done) {
    request(app)
      .get('/stats')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /upload, should 302', function(done) {
    request(app)
      .get('/upload')
      .expect(302)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches', function(done) {
    request(app)
      .get('/matches')
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
})

//todo, load test data, run functions against test data
describe("MONGODB", function() {
  it("connected", function(done) {
    assert(db);
    done();
  });
  it("added a player", function(done) {
    db.players.insert(howard, function(err) {
      done(err);
    });
  });
  after(function(done) {
    db.get('players')
      .drop(function(err) {
        done(err);
      });
  });
});

//test against redis of utility
describe("REDIS", function() {
  it("added test value", function(done) {
    client.set("some key", "some val");
    done();
  });
  it('retrieved test value', function(done) {
    client.get("some key", function(err, reply) {
      assert.equal(reply, "some val");
      done(err);
    });
  });
});

describe('PARSER', function() {
  //ardm game
  //regular game
  //test epilogue
  //test streaming input
  //test file input
  //test broken file
});

//todo add tests for retriever
describe('RETRIEVER', function() {
  //check GET /
  //get a replay salt
});
