var assert = require('assert');
var async = require('async');
var utility = require('../utility')("mongodb://localhost/test");
var request = require('supertest')(app);
var app = require("../yasp");
var client = utility.redis;
var db = utility.db;
var testdata = require('./test.json');
describe("MONGODB", function() {
  it("connected", function(done) {
    assert(db);
    done();
  });
  it("added players", function(done) {
    async.mapSeries(testdata.players, function(p, cb) {
      db.players.insert(p, function(err) {
        cb(err);
      });
    }, function(err) {
      done(err);
    });
  });
  it("added matches", function(done) {
    async.mapSeries(testdata.matches, function(p, cb) {
      db.matches.insert(p, function(err) {
        cb(err);
      });
    }, function(err) {
      done(err);
    });
  });
  //getMatchesByPlayer: getMatchesByPlayer,
});

describe("REDIS", function() {
  it("connected", function(done) {
    assert(client);
    done();
  });
  it("added banner_msg", function(done) {
    client.set("banner_msg", "some val");
    done();
  });
  it('retrieved banner_msg', function(done) {
    client.get("banner_msg", function(err, reply) {
      assert.equal(reply, "some val");
      done(err);
    });
  });
});

describe('WEB', function() {
  it('GET /', function(done) {
    request
      .get('/')
      .expect(200, "YASP")
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /stats', function(done) {
    request
      .get('/stats')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /upload not signed in', function(done) {
    request
      .get('/upload')
      .expect(302)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches', function(done) {
    request
      .get('/matches')
      .expect(200, "Recent Matches")
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/? valid', function(done) {
    request
      .get('/matches/870061127')
      .expect(200, "Match 870061127")
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/? invalid', function(done) {
    request
      .get('/matches/1')
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/details unparsed', function(done) {
    request
      .get('/matches/1')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/graphs unparsed', function(done) {
    request
      .get('/matches/870061127/graphs')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/chat unparsed', function(done) {
    request
      .get('/matches/870061127/chat')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  //matches/details parsed
  //matches/graphs parsed
  //matches/chat parsed
  it('GET /players/? valid', function(done) {
    request
      .get('/players/88367253')
      .expect(200, "1-0")
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /players/? invalid', function(done) {
    request
      .get('/players/1')
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /players/?/matches valid', function(done) {
    request
      .get('/players/88367253/matches')
      .expect(200, "88367253")
      .end(function(err, res) {
        done(err);
      });
  });
  //players/?/matches invalid
  //api/items valid
  //api/items invalid
  //api/abilities valid
  //api/abilities invalid
  //api/matches valid
  //api/matches invalid
  //login
  //return
  //logout
  //GET /upload
  //POST /upload proper file, too large, invalid file
  //check login require
  //check untracked_msg
  it('GET / banner_msg', function(done) {
    request
      .get('/')
      .expect(200, "some val")
      .end(function(err, res) {
        done(err);
      });
  });
})

describe('PARSER', function() {
process.env.STREAM = true;
process.env.STREAM = false;
  //ardm game
  //regular game
  //test epilogue parse
  //test streaming input
  //test file input
  //test broken file
  //test invalid file
});

describe('RETRIEVER', function() {
  //check GET /
  //get a replay salt
});

describe('KUE', function() {
  it("kue", function(done) {
    assert(utility.kue);
    done();
  });
  it("jobs", function(done) {
    assert(utility.jobs);
    done();
  });
});

describe('CLEANUP', function() {
  it("db", function(done) {
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    connect('mongodb://localhost/test', function(err, db) {
      databaseCleaner.clean(db, function(err) {
        done(err);
      });
    });
  });
  it("redis", function(done) {
    client.flushall(function(err) {
      done(err);
    });
  });
});

//functions to test
//queueReq: queueReq, add a job to kue
//processApi: processApi,
//processUpload: processUpload,
//processParse: processParse, test in both streaming and download modes
//untrackPlayers: untrackPlayers, //create artificial player to be untracked
//clearactivejobs, assert 0 active left

//unit test
//convert32to64: convert32to64,
//convert64to32: convert64to32,
//isRadiant: isRadiant,
//generateJob: generateJob,
//makeSearch: makeSearch,
//makeSort: makeSort,
//mergeObjects: mergeObjects, //try numerous test cases, with increasing complexity
//getCurrentSeqNum: getCurrentSeqNum,

//web helpers
//mergeMatchData: mergeMatchData,
//generateGraphData: generateGraphData,
///fillPlayerInfo: fillPlayerInfo

//grunt tasks
//unparsed: unparsed, //generate fake data and see if jobs added to kue
//getFullMatchHistory: getFullMatchHistory, //run on single player
//generateConstants: generateConstants, //check if valid file?
//updateSummaries: updateSummaries, //generate fake data and run
