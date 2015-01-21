var request = require('supertest');
// Here we get hold of the express application 
var app = require("../web").app;
var redis = require('redis');
var monk = require("monk");
var assert = require("assert");
var db;

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
      account_id: 88367253
    }, {
      $set: {
        account_id: 88367253,
        track: 1,
        full_history: 1
      }
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

describe("REDIS", function() {
  it("added test values", function(done) {
    var client = redis.createClient(6379, '127.0.0.1');
    client.set("some key", "some val");
    client.get("some key", function(err, reply) {
      done(err)
    });
  });
})

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
  it('GET /upload 302', function(done) {
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

//todo add tests for parser