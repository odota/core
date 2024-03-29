// Deployed in the cloud to proxy requests to the Steam API
import httpProxy from 'http-proxy';
import http from 'http';
import config from '../config';
const { PORT, PROXY_PORT } = config;
const port = PORT || PROXY_PORT;
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
server.listen(port);
console.log('listening on port %s', port);
