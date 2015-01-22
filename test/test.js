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

describe("REDIS", function() {
  it("connected", function(done) {
    assert(client);
    done();
  })
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
  //insert banner_msg
});

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
  //kue
  //matches valid
  //matches invalid
  //matches/details
  //matches/details unparsed
  //players valid
  //players invalid
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
  //POST /upload
  //check login require
  //check untracked_msg
  //check banner_msg
})

describe('PARSER', function() {
  //ardm game
  //regular game
  //test epilogue parse
  //test streaming input
  //test file input
  //test broken file
});

describe('RETRIEVER', function() {
  //check GET /
  //get a replay salt (need a steam acct)
});

describe('KUE', function(){
    it("kue", function(done) {
    assert(utility.kue);
    done();
  });
    it("jobs", function(done) {
    assert(utility.jobs);
    done();
  });
});

//queueReq: queueReq, add a job to kue
//getMatchesByPlayer: getMatchesByPlayer,
//makeSearch: makeSearch,
//makeSort: makeSort,
//convert32to64: convert32to64,
//convert64to32: convert64to32,
//isRadiant: isRadiant,
//generateJob: generateJob,
//runParse: runParse,
//getData: getData,
//updateSummaries: updateSummaries, //generate fake data and run
//getCurrentSeqNum: getCurrentSeqNum,
//processParse: processParse,
//processParseStream: processParseStream,
//processApi: processApi,
//processUpload: processUpload,
//decompress: decompress,
//parseFile: parseFile,
//parseStream: parseStream,
//insertPlayer: insertPlayer,
//insertParse: insertParse,
//insertMatch: insertMatch,
//mergeObjects: mergeObjects, //try numerous test cases, with increasing complexity
//untrackPlayers: untrackPlayers, //create artificial player to be untracked
//unparsed: unparsed, //generate fake data and see if jobs added to kue
//getFullMatchHistory: getFullMatchHistory, //run on single player
//generateConstants: generateConstants, //check if valid file?
//clearactivejobs, assert 0 active left