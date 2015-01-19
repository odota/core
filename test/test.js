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