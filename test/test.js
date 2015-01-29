process.env.MONGO_URL = "mongodb://localhost/test";
process.env.REDIS_URL = 'redis://localhost:6379/1';
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
var browser = new Zombie({
    maxWait: wait,
    runScripts: false
});

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
        var split = path.split("?");
        var split2 = split[0].split(".com");
        return split2[0];
    })
    .get('/IDOTA2Match_570/GetMatchDetails/V001/')
    .times(1)
    .reply(200, {
        result: testdata.matches[0]
    })
    .get('/ISteamUser/GetPlayerSummaries/v0002/')
    .times(2)
    .reply(200, testdata.summaries_api)
    .get('/IEconDOTA2_570/GetHeroes/v0001/')
    .times(1)
    .reply(200, testdata.heroes_api);

before(function(done) {
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    async.series([
            function(cb) {
                console.log("wiping mongodb");
                connect(process.env.MONGO_URL, function(err, db) {
                    assert(!err);
                    databaseCleaner.clean(db, function(err) {
                        cb(err);
                    });
                });
            },
            function(cb) {
                console.log("wiping redis");
                utility.redis.flushall(function(err) {
                    cb(err);
                });
            },
            function(cb) {
                console.log("loading players");
                async.mapSeries(testdata.players, function(p, cb) {
                    p.last_visited = new Date("2012-08-31T15:59:02.161+0100");
                    db.players.insert(p, function(err) {
                        cb(err);
                    });
                }, function(err) {
                    cb(err);
                });
            },
            function(cb) {
                console.log("loading matches");
                async.mapSeries(testdata.matches, function(p, cb) {
                    db.matches.insert(p, function(err) {
                        cb(err);
                    });
                }, function(err) {
                    cb(err);
                });
            },
            function(cb) {
                console.log("copying replay to test dir");
                var replay_dir = process.env.REPLAY_DIR;
                if (!fs.existsSync(replay_dir)) {
                    fs.mkdir(replay_dir);
                }
                fs.createReadStream(__dirname + '/1193091757.dem').pipe(fs.createWriteStream(replay_dir + '1193091757.dem')).on('finish', function(err) {
                    done(err);
                });
            }
        ],
        function(err) {
            done(err);
        });
});
after(function(done) {
    //shut down webserver
    app.close();
    done();
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
    });
    describe("/status", function() {
        before(function(done) {
            browser.visit('/status');
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
        it('should have 0-2 record', function(done) {
            browser.assert.text('h2', /.*0-1.*/);
            done();
        });
    });
    describe("/players/:valid (no matches)", function() {
        before(function(done) {
            browser.visit('/players/99999');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have 0-0 record', function(done) {
            browser.assert.text('h2', /.*0-0.*/);
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
    //players/:valid/stats
    //api/items valid
    //api/items invalid
    //api/abilities valid
    //api/abilities invalid
    //api/matches valid
    //api/matches invalid
    //login
    //return
    //logout
    ///upload (logged in)
    //POST /upload proper file, too large, invalid file
    //check untracked_msg
    //matches/details parsed
    //matches/graphs parsed
    //matches/chat parsed
    //preferences
    //fullhistory
    //verify_recaptcha
    */
});

describe("tasks", function() {
    this.timeout(wait);
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
    it('generate constants', function(done) {
        tasks.generateConstants(function(err) {
            done(err);
        });
    });
    /*
    it('full history', function(done) {
        done();
    });
    */
});

describe("backend", function() {
    it('process details request', function(done) {
        utility.queueReq("api_details", {
            match_id: 115178218
        }, function(err, job) {
            assert(job);
            processors.processApi(job, function(err) {
                done(err);
            })
        });
    });
    it('process summaries request', function(done) {
        utility.queueReq("api_summaries", {
            players: [{
                account_id: 88367253
            }]
        }, function(err, job) {
            assert(job);
            processors.processApi(job, function(err) {
                done(err);
            });
        });
    });
});

describe("parser", function() {
    this.timeout(60000);
    it('parse match (file)', function(done) {
        var job = {
            match_id: 115178218,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);

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
            assert(job && !err);

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
            assert(job && !err);

            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse local replay', function(done) {
        var job = {
            match_id: 1193091757,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse truncated replay', function(done) {
        var job = {
            match_id: 1,
            start_time: moment().format('X'),
            fileName: __dirname + "/truncate.dem"
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                assert(err);
                console.log(err);
                done();
            });
        });
    });
    it('parse invalid file', function(done) {
        var job = {
            match_id: 1,
            start_time: moment().format('X'),
            fileName: __dirname + "/invalid.dem"
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);
            console.log(job.data.payload);
            processors.processParse(job, function(err) {
                assert(err);
                console.log(err);
                done();
            });
        });
    });
    //1v1 game
    //ardm game
    //test epilogue parse
});

//queries
//mergeObjects, multiple cases?
//mergeMatchData: mergeMatchData,
//generateGraphData: generateGraphData,
//computeStatistics