process.env.NODE_ENV = "test";
process.env.MONGO_URL = "mongodb://localhost/test";
var assert = require('assert');
var async = require('async');
var utility = require('../utility');
var app = require("../yasp");
var request = require('supertest')(app);
var client = utility.redis;
var db = utility.db;
var testdata = require('./test.json');
describe("TESTS", function() {
  before(function(done) {
    async.series([function(cb) {
      async.mapSeries(testdata.players, function(p, cb) {
        db.players.insert(p, function(err) {
          cb(err);
        });
      }, function(err) {
        cb(err);
      });
    }, function(cb) {
      async.mapSeries(testdata.matches, function(p, cb) {
        db.matches.insert(p, function(err) {
          cb(err);
        });
      }, function(err) {
        cb(err);
      });
    }], function(err) {
      client.set("banner", "someval");
      done(err);
    });
  });
  after(function(done) {
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    connect(process.env.MONGO_URL, function(err, db) {
      databaseCleaner.clean(db, function(err) {
        client.flushall(function(err) {
          done(err);
        });
      });
    });
  });
  it("mongodb connected", function(done) {
    assert(db);
    done();
  });
  it("kue ready", function(done) {
    assert(utility.kue);
    done();
  });
  it("kue jobs queue ready", function(done) {
    assert(utility.jobs);
    done();
  });
  it("redis connected", function(done) {
    assert(client);
    done();
  });
  //todo use zombie.js to emulate browser
  it('GET /', function(done) {
    request.get('/')
      .expect(200, /YASP*/)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /stats', function(done) {
    request.get('/stats')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /upload not signed in', function(done) {
    request.get('/upload')
      .expect(302)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches', function(done) {
    request.get('/matches')
      .expect(200, /Recent*/)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/? valid', function(done) {
    request.get('/matches/1151783218')
      .expect(200, /Victory*/)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/? invalid', function(done) {
    request.get('/matches/1')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/details unparsed', function(done) {
    request.get('/matches/1')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/graphs unparsed', function(done) {
    request.get('/matches/1151783218/graphs')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /matches/?/chat unparsed', function(done) {
    request.get('/matches/1151783218/chat')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /players/? valid', function(done) {
    request.get('/players/88367253')
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /players/? invalid', function(done) {
    request.get('/players/1')
      .expect(500)
      .end(function(err, res) {
        done(err);
      });
  });
  it('GET /players/?/matches valid', function(done) {
    request.get('/players/88367253/matches')
      .expect(200, /1151783218*/)
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
  //matches/details parsed
  //matches/graphs parsed
  //matches/chat parsed

  //queueReq: queueReq, add a job to kue
  //processApi: processApi,
  //processUpload: processUpload,
  //processParse: processParse, test in both streaming and download modes
  process.env.STREAM = true;
  process.env.STREAM = false;
  //untrackPlayers: untrackPlayers, //create artificial player to be untracked
  //ardm game
  //regular game
  //test epilogue parse
  //test broken file
  //test invalid file
  //clearactivejobs, assert 0 active left
  it('banner', function(done) {
    request.get('/')
      .expect(200, /someval*/)
      .end(function(err, res) {
        done(err);
      });
  });
});

describe('RETRIEVER', function() {
  //check GET /
  //get a replay salt
});

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

//load large dataset
//check load time of player page