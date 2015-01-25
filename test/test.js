//process.env.NODE_ENV = "test";
process.env.MONGO_URL = "mongodb://localhost/test";
process.env.DELETE_REPLAYS = true;
process.env.ROOT_URL = "http://localhost:5000";
process.env.RETRIEVER_HOST = "http://localhost:5100";
process.env.SESSION_SECRET = "testsecretvalue";
process.env.PORT = 5000;
process.env.REPLAY_DIR = "./testreplays/";
var assert = require('assert');
var async = require('async');
var utility = require('../utility');
var app = require("../yasp");
var request = require('supertest')(app);
var client = utility.redis;
var db = utility.db;
var testdata = require('./test.json');
var nock = require('nock');
var moment = require('moment');
//todo write to fake kue

//fake retriever response
nock('http://localhost:5100')
  .filteringPath(function(path) {
    return '/';
  })
  .get('/')
  .times(2)
  .reply(200, {
    match: {
      cluster: 1,
      replaySalt: 1
    }
  });

//fake replay response
nock('http://replay1.valve.net')
  .filteringPath(function(path) {
    return '/';
  })
  .get('/')
  .replyWithFile(200, __dirname + '/1151783218.dem.bz2')
  .get('/')
  .replyWithFile(200, __dirname + '/1151783218.dem.bz2');

//fake api response
nock('https://api.steampowered.com')
  .filteringPath(function(path) {
    if (path.slice(0, 8) === "/IDOTA2") {
      return '/IDOTA2Match_570/GetMatchDetails/V001/';
    }
    else {
      return '/ISteamUser/GetPlayerSummaries/v0002/';
    }
  })
  .get('/IDOTA2Match_570/GetMatchDetails/V001/')
  .reply(200, {
    result: testdata.matches[0]
  })
  .get('/ISteamUser/GetPlayerSummaries/v0002/')
  .reply(200, testdata.summaries);

describe("TESTS", function() {
  before(function(done) {
    async.series([function(cb) {
      async.mapSeries(testdata.players, function(p, cb) {
        p.last_visited = new Date("2012-08-31T15:59:02.161+0100");
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

  it('banner', function(done) {
    request.get('/')
      .expect(200, /someval*/)
      .end(function(err, res) {
        done(err);
      });
  });
  it('unparsed matches, parse jobs to kue', function(done) {
    utility.unparsed(function(err, num) {
      assert.equal(num, 1);
      client.flushall();
      done(err);
    });
  });
  it('update summaries, api jobs to kue', function(done) {
    utility.updateSummaries(function(err, num) {
      assert.equal(num, 2);
      client.flushall();
      done(err);
    });
  });
  it('untrack players', function(done) {
    utility.untrackPlayers(function(err, num) {
      assert.equal(num, 2);
      done(err);
    });
  });
  it('request match details, summaries through kue', function(done) {
    utility.queueReq("api_details", {
      match_id: 115178218
    }, function(err, job) {
      utility.processApi(job,
        function(err) {
          done(err);
        });
    });
  });
  /*
  it('upload job', function(done) {
    utility.jobs.process('upload', utility.processUpload);
  });
  */
  it('parse expired match through kue', function(done) {
    //fake parse request
    utility.queueReq("parse", {
      match_id: 1,
      start_time: moment().subtract(1, 'month').format('X')
    }, function(err, job) {
      if (err) {
        return done(err);
      }
      utility.processParse(job, function(err) {
        assert(err);
        assert.equal(err.message, "Error: replay expired");
        done();
      });
    });
  });
  it('parse match through kue (file)', function(done) {
    this.timeout(30000);
    //fake parse request
    utility.queueReq("parse", {
      match_id: 115178218,
      start_time: moment().format('X')
    }, function(err, job) {
      if (err) {
        return done(err);
      }
      utility.processParse(job, function(err) {
        done(err);
      });
    });
  });
  it('parse match through kue (stream)', function(done) {
    this.timeout(30000);
    //fake parse request
    utility.queueReq("parse", {
      match_id: 115178218,
      start_time: new Date()
    }, function(err, job) {
      if (err) {
        return done(err);
      }
      utility.processParseStream(job, function(err) {
        done(err);
      });
    });
  });

  //runParse directly onfiles, verify output fields
  //1v1 game
  //ardm game
  //regular game
  //test epilogue parse
  //test broken file
  //test invalid file
});

describe('RETRIEVER', function() {
  //check GET /
  //get a replay salt
});

//unit test
//mergeObjects: mergeObjects, //try numerous test cases, with increasing complexity

//web helpers
//mergeMatchData: mergeMatchData,
//generateGraphData: generateGraphData,
///fillPlayerInfo: fillPlayerInfo

//s3 methods are untested
//load large dataset
//check load time of player page