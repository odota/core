// Proxies requests to the Steam API
import http from "node:http";
import { pipeline } from "node:stream";
import config from "../config.ts";
import os from "node:os";

const { PORT, PROXY_PORT } = config;
const port = PORT || PROXY_PORT;

const TARGET_HOST = "api.steampowered.com";
const TARGET_PORT = 80;

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    return res.end("ok");
  }

  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      // changeOrigin: rewrite the Host header to match the target
      headers: { ...req.headers, host: TARGET_HOST },
    },
    (proxyRes) => {
      res.writeHead(
        proxyRes.statusCode ?? 502,
        proxyRes.statusMessage,
        proxyRes.headers,
      );
      pipeline(proxyRes, res, () => {});
    },
  );

  proxyReq.on("error", (err) => {
    console.error("proxy error: %s", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end("Bad gateway");
  });

  // Abort the upstream request if the client goes away
  res.on("close", () => {
    if (!res.writableFinished) {
      proxyReq.destroy();
    }
  });

  pipeline(req, proxyReq, () => {});
});

server.listen(port);
console.log("listening on port %s", port);

if (config.SERVICE_REGISTRY_HOST) {
  let ip = os.networkInterfaces()?.eth0?.[0]?.address;
  if (config.EXTERNAL) {
    const resp = await fetch(`https://${config.SERVICE_REGISTRY_HOST}/ip`);
    if (!resp.ok) {
      throw new Error("fetch not ok");
    }
    ip = await resp.text();
  }
  setInterval(() => {
    // Re-register ourselves as available
    const registerUrl = `https://${config.SERVICE_REGISTRY_HOST}/register/proxy/${ip}?key=${config.RETRIEVER_SECRET}`;
    console.log("registerUrl: %s", registerUrl);
    fetch(registerUrl, { method: "POST" });
  }, 5000);
}