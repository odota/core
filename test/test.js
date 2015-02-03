var dotenv = require('dotenv');
dotenv.load();
process.env.MONGO_URL = "mongodb://localhost/test";
process.env.REDIS_URL = "redis://localhost:6379/1";
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
var app = require('../yasp');
var processors = require('../processors');
var tasks = require('../tasks');
var fs = require('fs');
var request = require('request');
var wait = 10000;
Zombie.localhost('localhost', process.env.PORT);
var browser = new Zombie({
    maxWait: wait,
    runScripts: false
});

//fake retriever response
nock(process.env.RETRIEVER_HOST)
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
    .replyWithFile(200, __dirname + '/1151783218.dem.bz2');

//fake api response
nock('http://api.steampowered.com')
    .filteringPath(function(path) {
        var split = path.split("?");
        var split2 = split[0].split(".com");
        return split2[0];
    })
    //throw some errors to test handling
    .get('/IDOTA2Match_570/GetMatchDetails/V001/')
    .reply(500, {})
    .get('/IDOTA2Match_570/GetMatchDetails/V001/')
    .reply(200, testdata.details_api)
    .get('/ISteamUser/GetPlayerSummaries/v0002/')
    .reply(200, testdata.summaries_api)
    .get('/IDOTA2Match_570/GetMatchHistory/V001/')
    .reply(200, {
        result: {
            error: "error"
        }
    })
    .get('/IDOTA2Match_570/GetMatchHistory/V001/')
    .reply(200, testdata.history_api)
    .get('/IDOTA2Match_570/GetMatchHistory/V001/')
    .reply(200, testdata.history_api2)
    .get('/IEconDOTA2_570/GetHeroes/v0001/')
    .reply(200, testdata.heroes_api);

//fake dota2 response
nock('http://www.dota2.com')
    .get('/jsfeed/itemdata?l=english')
    .reply(200, testdata.item_api)
    .get('/jsfeed/abilitydata')
    .reply(200, testdata.ability_api);

before(function(done) {
    this.timeout(wait);
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
                //set visited date on first player
                testdata.players[0].last_visited = new Date();
                testdata.players[1].last_visited = new Date("2012-08-31T15:59:02.161+0100");
                async.mapSeries(testdata.players, function(p, cb) {
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
                console.log("copying replays to test dir");
                var replay_dir = process.env.REPLAY_DIR;
                if (!fs.existsSync(replay_dir)) {
                    fs.mkdir(replay_dir);
                }
                async.parallel([
                    function(cb) {
                        fs.createReadStream(__dirname + '/1193091757.dem').pipe(fs.createWriteStream(replay_dir + '1193091757.dem')).on('finish', function(err) {
                            cb(err);
                        });
                    },
                    function(cb) {
                        fs.createReadStream(__dirname + '/1181392470_1v1.dem').pipe(fs.createWriteStream(replay_dir + '1181392470.dem')).on('finish', function(err) {
                            cb(err);
                        });
                    },
                    function(cb) {
                        fs.createReadStream(__dirname + '/1189263979_ardm.dem').pipe(fs.createWriteStream(replay_dir + '1189263979.dem')).on('finish', function(err) {
                            cb(err);
                        });
                    },
                    function(cb) {
                        fs.createReadStream(__dirname + '/invalid.dem').pipe(fs.createWriteStream(replay_dir + 'invalid.dem')).on('finish', function(err) {
                            cb(err);
                        });
                    }
                ], function(err) {
                    cb(err);
                });
            },
            function(cb) {
                console.log("starting web");
                app.listen(process.env.PORT);
                cb();
            }
        ],
        function(err) {
            done(err);
        });
});
after(function(done) {
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
                assert(err);
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
                assert(err);
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
                assert(err);
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
        it('should have a w/l record', function(done) {
            browser.assert.text('h2', /.*1-1.*/);
            done();
        });
    });
    describe("/players/:valid (no matches)", function() {
        before(function(done) {
            browser.visit('/players/88367251');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a w/l record', function(done) {
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
    describe("/players/:valid/stats", function() {
        before(function(done) {
            browser.visit('/players/88367253/stats');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Teammates', function(done) {
            browser.assert.text('body', /Teammates/);
            done();
        });
    });
    describe("/players/:valid/:invalid", function() {
        before(function(done) {
            browser.visit('/players/88367253/asdf');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/players/:invalid/matches", function() {
        before(function(done) {
            browser.visit('/players/1/matches');
            browser.wait(wait, function(err) {
                assert(err);
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
    describe("/matches/:valid/details (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/details');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Purchases', function(done) {
            browser.assert.text('body', /Purchases/);
            done();
        });
    });
    describe("/matches/:valid/graphs (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/graphs');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Gold', function(done) {
            browser.assert.text('body', /Gold/);
            done();
        });
    });
    describe("/matches/:valid/chat (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/chat');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Chat', function(done) {
            browser.assert.text('body', /Chat/);
            done();
        });
    });
    describe("/matches/:valid/:invalid (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/asdf');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/login", function() {
        before(function(done) {
            browser.visit('/login');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/return", function() {
        before(function(done) {
            browser.visit('/return');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/about", function() {
        before(function(done) {
            browser.visit('/about');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    /*
    describe("/upload (logged in)", function() {
        before(function(done) {
            browser.visit('/upload');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("POST /upload", function() {
        it('should upload', function(done) {
            var formData = {
                replay: fs.createReadStream(__dirname + '/1193091757.dem')
            };
            request.post({
                url: process.env.ROOT_URL+'/upload',
                formData: formData
            }, function(err, resp, body) {
                done(err);
            });
        });
    });
    */
    //todo test passport-steam login function
    //todo test upload
    describe("/logout", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/logout', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("invalid page", function() {
        before(function(done) {
            browser.visit('/asdf');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 404', function(done) {
            browser.assert.status(404);
            done();
        });
    });
    //todo use supertest for api endpoints
    describe("/api/matches", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/api/matches', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
        it('should return JSON', function(done) {
            request.get(process.env.ROOT_URL + '/api/matches?draw=2&columns%5B0%5D%5Bdata%5D=match_id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=game_mode&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=cluster&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=duration&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=start_time&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=parse_status&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&start=0&length=10&search%5Bvalue%5D=&search%5Bregex%5D=false&_=1422621884994', function(err, resp, body) {
                assert(resp.statusCode === 200);
                assert(body);
                done(err);
            });
        });
    });
    describe("/api/items", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/api/items', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("/api/abilities", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/api/abilities', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("/preferences", function() {
        it('should return JSON', function(done) {
            request.post(process.env.ROOT_URL + '/preferences', {}, function(err, resp, body) {
                assert(body)
                done(err);
            });
        });
    });
    describe("/fullhistory", function() {
        it('should return JSON', function(done) {
            request.post(process.env.ROOT_URL + '/fullhistory', {}, function(err, resp, body) {
                assert(body);
                done(err);
            });
        });
    });
    describe("/verify_recaptcha", function() {
        it('should return JSON', function(done) {
            request.post(process.env.ROOT_URL + '/verify_recaptcha', {
                form: {
                    recaptcha_challenge_field: "asdf",
                    recaptcha_response_field: "jkl;"
                }
            }, function(err, resp, body) {
                assert(resp.statusCode === 200);
                assert(body);
                done(err);
            });
        });
    });
});

describe("tasks", function() {
    this.timeout(wait);
    it('unparsed matches', function(done) {
        tasks.unparsed(function(err, num) {
            assert.equal(num, 1);
            done(err);
        });
    });
    it('updateNames', function(done) {
        tasks.updateNames(function(err, num) {
            done(err);
        });
    });
    it('full history', function(done) {
        tasks.getFullMatchHistory(function(err) {
            done(err);
        }, ["1"]);
    });
    it('generate constants', function(done) {
        tasks.generateConstants(function(err) {
            done(err);
        }, "./constants_test.json");
    });
});

describe("backend", function() {
    this.timeout(wait);
    it('process details request', function(done) {
        utility.queueReq("api_details", {
            match_id: 870061127
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
            console.log(job.data.url);
            processors.processApi(job, function(err) {
                done(err);
            });
        });
    });
});

describe("parser", function() {
    this.timeout(60000);
    it('parse replay (download)', function(done) {
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
    it('parse replay (local)', function(done) {
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
    it('parse 1v1', function(done) {
        var job = {
            match_id: 1181392470,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse ardm', function(done) {
        var job = {
            match_id: 1189263979,
            start_time: moment().format('X')
        };
        utility.queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse invalid file', function(done) {
        var job = {
            match_id: 1,
            start_time: moment().format('X'),
            fileName: process.env.REPLAY_DIR + "/invalid.dem"
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
});
