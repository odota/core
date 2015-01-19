var request = require('supertest');

// Here we get hold of the express application 
var app = require("../web").app;

describe('GET /stats', function() {
  it('should respond with JSON', function(done) {
    request(app)
      .get('/stats')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });
});