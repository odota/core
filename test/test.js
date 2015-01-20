var request = require('supertest');

// Here we get hold of the express application 
var app = require("../web").app;

describe('GET /', function() {
  it('got 200 response', function(done) {
    request(app)
      .get('/')
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
});

describe('GET /stats', function() {
  it('got 200 response', function(done) {
    request(app)
      .get('/stats')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
});

describe('GET /upload', function() {
  it('got 302 response', function(done) {
    request(app)
      .get('/upload')
      .expect(302)
      .end(function(err, res) {
        done(err);
      });
  });
});

describe('GET /matches', function() {
  it('got 200 response', function(done) {
    request(app)
      .get('/matches')
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
});

