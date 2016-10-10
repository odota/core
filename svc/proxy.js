/**
 * Worker proxying requests to the Steam API.
 **/
const config = require('../config');
const httpProxy = require('http-proxy');
const http = require('http');
const PORT = config.PORT || config.PROXY_PORT;
const proxy = httpProxy.createProxyServer({
  target: 'http://api.steampowered.com',
  changeOrigin: true,
});

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    return res.end('ok');
  }
  return proxy.web(req, res);
});

server.listen(PORT);
console.log('listening on port %s', PORT);
