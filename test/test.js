var request = require('supertest');
var assert = require("assert");
var howard = {
  account_id: 88367253,
  track: 1,
  full_history: 1
};

var redis = require('redis');
var monk = require("monk");
var client = redis.createClient(6379, '127.0.0.1');
var db;

//todo test upload
describe('WEB', function() {
  var app = require("../yasp").app;
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
//refactor db operation functions
//construct db instance with something like utility.db("connectionstring").matches
describe("MONGODB", function() {
  beforeEach(function(done) {
    db = monk('localhost/test');
    done();
  });
  it("connected", function(done) {
    assert(db);
    done();
  });

  it("added a player", function(done) {
    db.get('players').update({
      account_id: howard.account_id
    }, {
      $set: howard
    }, {
      upsert: true
    }, function(err) {
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
  })
});

//todo expose functions to tester
describe('PARSER', function() {
  //ardm game
  //regular game
  //test epilogue
  //test streaming input
  //test file input
});

//todo add tests for retriever
describe('RETRIEVER', function() {
  //check if up
  //get a replay salt
});
