// Deployed in the cloud to proxy requests to the Steam API
import httpProxy from 'http-proxy';
import http from 'http';
import config from '../config';
import child_process from 'child_process';
import axios from 'axios';
import os from 'os';
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
if (config.SERVICE_REGISTRY_HOST) {
  let ip = os.networkInterfaces()?.eth0?.[0]?.address;
  if (config.EXTERNAL) {
    ip = child_process.spawnSync(`curl ${config.SERVICE_REGISTRY_HOST}/ip`).stdout.toString();
  }
  setInterval(() => {
    // Re-register ourselves as available
    const registerUrl = `https://${
      config.SERVICE_REGISTRY_HOST
    }/register/proxy/${ip}?key=${
      config.RETRIEVER_SECRET
    }`;
    console.log('registerUrl: %s', registerUrl);
    axios.post(registerUrl);
  }, 5000);
}
