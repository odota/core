process.env.MONGO_URL = "mongodb://localhost/test";
process.env.SESSION_SECRET = "testsecretvalue";
process.env.PORT = 5000;
process.env.RETRIEVER_HOST = "http://localhost:5100";
process.env.REPLAY_DIR = "./replays_test/";
process.env.DELETE_REPLAYS = true;
process.env.ROOT_URL = "http://localhost:5000";

var async = require('async');
var utility = require('../utility');
var db = utility.db;
var testdata = require('./test.json');
var nock = require('nock');
var moment = require('moment');
var assert = require('assert');
var Zombie = require('zombie');
var app = require('../yasp').listen(process.env.PORT);
var processors = require('../processors');
var tasks = require('../tasks');
var fs = require('fs');

var wait = 10000;
Zombie.localhost('localhost', process.env.PORT);
var browser = new Zombie({maxWait: wait, runScripts:false});

//fake retriever response
nock('http://localhost:5100')
    .filteringPath(function(path) {
        return '/';
    })
    .get('/')
    .times(3)
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

before(function(done) {
    console.log("loading test data");
    async.series([function(cb) {
        //insert test players
        async.mapSeries(testdata.players, function(p, cb) {
            p.last_visited = new Date("2012-08-31T15:59:02.161+0100");
            db.players.insert(p, function(err) {
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    }, function(cb) {
        //insert test matches
        async.mapSeries(testdata.matches, function(p, cb) {
            db.matches.insert(p, function(err) {
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    }], function(err) {
        //set the banner msg
        utility.redis.set("banner", "someval");
        done(err);
    });
});
after(function(done) {
    console.log("cleaning test data");
    app.close();
    //wipe mongodb and redis
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    connect(process.env.MONGO_URL, function(err, db) {
        databaseCleaner.clean(db, function(err) {
            utility.redis.flushall(function(err) {
                done(err);
            });
        });
    });
});

describe("services", function() {
    it("mongodb connected", function(done) {
        assert(utility.db);
        done();
    });
    it("redis connected", function(done) {
        assert(utility.redis);
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
});

describe("tasks", function() {
    it('unparsed matches', function(done) {
        tasks.unparsed(function(err, num) {
            assert.equal(num, 1);
            done(err);
        });
    });
    it('update summaries', function(done) {
        tasks.updateSummaries(function(err, num) {
            assert.equal(num, 2);
            done(err);
        });
    });
    it('untrack players', function(done) {
        tasks.untrackPlayers(function(err, num) {
            assert.equal(num, 2);
            done(err);
        });
    });
    /*
    it('full history', function(done) {
        done();
    });
    it('generate constants', function(done) {
        done();
    });
    */
});

describe("backend", function() {
    it('queue details request', function(done) {
        utility.queueReq("api_details", {
            match_id: 115178218
        }, function(err, job) {
            assert(job);
            done(err);
        });
    });
    //run processApi
});

describe("web", function() {
    this.timeout(wait);
    describe("/", function() {
        before(function(done) {
            browser.visit('/');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say YASP', function(done) {
            browser.assert.text('body', /YASP/);
            done();
        });
        it('should have a banner', function(done) {
            browser.assert.text('.alert', /someval/);
            done();
        });
    });
    describe("/stats", function() {
        before(function(done) {
            browser.visit('/stats');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/upload (not logged in)", function() {
        before(function(done) {
            browser.visit('/upload');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should have a login message', function(done) {
            browser.assert.text('.alert', /log in/);
            done();
        });
    });
    describe("/matches", function() {
        before(function(done) {
            browser.visit('/matches');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Recent Matches', function(done) {
            browser.assert.text('h3', /Recent\sMatches/);
            done();
        });
    });

    describe("/matches/:valid", function() {
        before(function(done) {
            browser.visit('/matches/1151783218');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a match', function(done) {
            browser.assert.text('h1', /Match\s1151783218/);
            done();
        });
    });

    describe("/matches/:invalid", function() {
        before(function(done) {
            browser.visit('/matches/1');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });

    describe("/matches/:invalid/details", function() {
        before(function(done) {
            browser.visit('/matches/1/details');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });

    describe("/players/:invalid", function() {
        before(function(done) {
            browser.visit('/players/1');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });

    describe("/players/:valid", function() {
        before(function(done) {
            browser.visit('/players/88367253');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/players/:valid/matches", function() {
        before(function(done) {
            browser.visit('/players/88367253/matches');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a match', function(done) {
            browser.assert.text('td', /1151783218/);
            done();
        });
    });
    describe("/players/:invalid/matches", function() {
        before(function(done) {
            browser.visit('/players/1/matches');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/matches/:valid/details (unparsed)", function() {
        before(function(done) {
            browser.visit('/matches/1151783218/details');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say no parsed data', function(done) {
            browser.assert.text('body', /no\sparsed\sdata/);
            done();
        });
    });

    /*
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
              //check untracked_msg
              //matches/details parsed
              //matches/graphs parsed
              //matches/chat parsed
              */
});

describe("parser", function() {
    this.timeout(40000);
    it('parse match (file)', function(done) {
        var job = {
            match_id: 115178218,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse match (stream)', function(done) {
        var job = {
            match_id: 115178218,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            processors.processParseStream(job, function(err) {
                done(err);
            });
        });
    });
    it('parse expired match', function(done) {
        var job = {
            match_id: 1,
            start_time: 1
        };
        utility.queueReq("parse", job, function(err, job) {
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    //runParse directly on files, verify no crash
    //1v1 game
    //ardm game
    //regular game
    //test epilogue parse
    //test broken file
    //test invalid file
});

//queries
//mergeMatchData: mergeMatchData,
//generateGraphData: generateGraphData,
///fillPlayerInfo: fillPlayerInfo (slow for large datasets)

//s3 methods are untested

/*
it('upload job', function(done) {
utility.jobs.process('upload', utility.processUpload);
});
*/