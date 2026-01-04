/**
 * Provides the OpenDota API and serves web requests
 * Also supports login through Steam
 * */
import compression from "compression";
import session from "cookie-session";
import moment from "moment";
import express from "express";
import passport from "passport";
import { SteamOpenIdStrategy } from "passport-steam-openid";
import cors from "cors";
import bodyParser from "body-parser";
import { Redis } from "ioredis";
import keys from "./api/keyManagement.ts";
import api from "./api/api.ts";
import db, { upsertPlayer } from "./store/db.ts";
import redis, {
  getRedisCountDayHash,
  redisCount,
  redisCountHash,
} from "./store/redis.ts";
import config from "../config.ts";
import stripe from "./store/stripe.ts";
import axios from "axios";
import { buildStatus } from "./util/buildStatus.ts";
import { getEndOfDay, getStartOfBlockMinutes } from "./util/time.ts";
import { convert64to32 } from "./util/utility.ts";

const admins = config.ADMIN_ACCOUNT_IDS.split(",").map((e) => Number(e));
export const app = express();
const host = config.ROOT_URL;
const sessOptions = {
  domain: config.COOKIE_DOMAIN,
  maxAge: 52 * 7 * 24 * 60 * 60 * 1000,
  secret: config.SESSION_SECRET,
};
const unlimitedPaths = [
  "/api", // OpenAPI spec
  "/api/metadata", // User metadata
];

// PASSPORT config
passport.serializeUser((user, done) => {
  done(null, user.account_id);
});
passport.deserializeUser((accountId, done) => {
  done(null, {
    // This is currently a number but Express.User wants it to be string
    account_id: accountId as string,
  });
});
passport.use(
  new SteamOpenIdStrategy(
    {
      returnURL: `${host}/return`,
      profile: false,
    },
    async (req, identifier, profile, cb) => {
      redisCount("login");
      const steamid = profile.steamid;
      const player = {
        steamid,
        account_id: Number(convert64to32(steamid)),
        last_login: new Date(),
      };
      await upsertPlayer(db, player);
      // This is currently a number but Express.User wants it to be string
      cb(null, { account_id: player.account_id as unknown as string });
    },
  ),
);

// Do logging when requests finish
const onResFinish = async (
  req: express.Request,
  res: express.Response,
  timeStart: number,
) => {
  const timeEnd = Date.now();
  const elapsed = timeEnd - timeStart;
  if (elapsed > 2000 || config.NODE_ENV === "development") {
    console.log("[SLOWLOG] %s, %s", req.originalUrl, elapsed);
    redisCount("slow_api_hit");
  }
  if (
    res.statusCode !== 500 &&
    res.statusCode !== 429 &&
    res.statusCode !== 404 &&
    !unlimitedPaths.includes(req.originalUrl.split("?")[0]) &&
    elapsed < 15000
  ) {
    if (res.locals.isAPIRequest) {
      const apiKey = res.locals.usageIdentifier;
      const apiTimestamp = moment.utc().startOf("month");
      const rows = await db.from("api_keys").where({
        api_key: apiKey,
      });
      const [apiRecord] = rows;
      if (apiRecord) {
        await db.raw(
          `
        INSERT INTO api_key_usage
        (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
        (?, ?, ?, ?, ?, 1)
        ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = api_key_usage.usage_count + 1
        `,
          [
            apiRecord.account_id,
            apiRecord.api_key,
            apiRecord.customer_id,
            apiTimestamp,
            "",
          ],
        );
      }
    }
  }
  redisCount("api_hits");
  if (req.headers.origin === config.UI_HOST) {
    redisCount("api_hits_ui");
  }
  const normPath = req.route?.path;
  redisCountHash("api_paths", req.method + " " + normPath);
  redisCountHash("api_status", String(res.statusCode));
  if (req.headers.origin) {
    redisCountHash("api_origins", req.headers.origin);
  }
  if (req.user && req.user.account_id) {
    await redis.zadd("visitors", moment.utc().format("X"), req.user.account_id);
    await redis.zremrangebyscore(
      "visitors",
      "-inf",
      moment.utc().subtract(30, "day").format("X"),
    );
  }
  await redis.lpush("load_times", elapsed);
  await redis.ltrim("load_times", 0, 9999);
  redis.setex("lastRun:" + config.APP_NAME, config.HEALTH_TIMEOUT, elapsed);
};

// Dummy User ID for testing
if (config.NODE_ENV === "test") {
  app.use((req, res, next) => {
    if (req.query.loggedin) {
      req.user = {
        account_id: "1",
      };
    }
    next();
  });
}

// Session/Passport middleware
// req.user available after this
app.use(session(sessOptions));
app.use(passport.initialize());
app.use(passport.session());
// register regenerate & save after the cookieSession middleware initialization
// Fix for passport 0.6.0+ which expects these functions
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb: Function) => {
      cb();
    };
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb: Function) => {
      cb();
    };
  }
  next();
});

// This is for passing the IP through if behind load balancer https://expressjs.com/en/guide/behind-proxies.html
app.set("trust proxy", true);

// Compress everything after this
app.use(compression());

// CORS headers
// All endpoints accessed from UI should be after this
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Reject request if not GET and Origin header is present and not an approved domain (prevent CSRF)
app.use((req, res, next) => {
  if (
    req.method !== "GET" &&
    req.header("Origin") &&
    req.header("Origin") !== config.UI_HOST
  ) {
    // Make an exception for replay parse request
    if (req.method === "POST" && req.originalUrl.startsWith("/api/request/")) {
      return next();
    }
    return res.status(403).json({ error: "Invalid Origin header" });
  }
  return next();
});

// Health check
app.get("/healthz", (req, res) => {
  res.end("ok");
});

app.get("/ip", (req, res) => {
  // Echo back the client's ip
  res.end(req.ip);
});

app.post("/register/:service/:host", async (req, res, next) => {
  // check secret matches
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    return res.status(403).end();
  }
  // zadd the given host and current time
  if (req.params.service && req.params.host) {
    const size = Number(req.query.size);
    const now = Date.now();
    const keys = [];
    if (size) {
      for (let i = 0; i < size; i++) {
        keys.push(now);
        keys.push(req.params.host + "?" + i);
      }
    } else {
      keys.push(now);
      keys.push(req.params.host);
    }
    const result = await redis.zadd(`registry:${req.params.service}`, ...keys);
    return res.send(result.toString());
  }
  return res.end();
});

app.get("/logs{/:jobId}", async (req, res) => {
  let logSub = new Redis(config.REDIS_URL);
  if (req.params.jobId) {
    await logSub.subscribe(req.params.jobId);
  } else {
    await logSub.subscribe("api", "parsed", "gcdata", "queue");
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const messageHandler = (channel: string, message: string) => {
    // Write as a Server Sent Event
    res.write("data: " + message + "\n\n");
    // Flush needed when using with compression
    res.flush();
  };
  logSub.on("message", messageHandler);
  req.once("close", async () => {
    // Client disconnected, shut down the subscribe
    logSub.off("message", messageHandler);
    await logSub.quit();
  });
});

app.get("/retrieverData", async (req, res, next) => {
  // check secret matches
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    return res.status(403).end();
  }
  const accountCount = Number(req.query.count) || 5;
  if ((await redis.scard("retrieverDataSet")) < accountCount) {
    // Refill the set if running out of logins
    const resp = await axios.get<string>(config.STEAM_ACCOUNT_DATA, {
      responseType: "text",
    });
    const accountData = resp.data.split(/\r\n|\r|\n/g);
    // Store in redis set
    const idReqs = await getRedisCountDayHash("retrieverSteamIDs");
    for (let line of accountData) {
      const accountName = line.split(/:|\t/)[0];
      const reqs = idReqs[accountName] || 0;
      // const reqs = Number(await redis.hget('retrieverSteamIDs', accountName));
      // const success = Number(
      //   await redis.hget('retrieverSuccessSteamIDs', accountName),
      // );
      // const ratio = success / reqs;
      // const isLowRatio = reqs > 25 && ratio <= 0;
      // Don't add high usage logons or high fail logons
      if (reqs < 250) {
        await redis.sadd("retrieverDataSet", line);
      }
    }
  }
  // Pop random elements
  const pop = await redis.spop("retrieverDataSet", accountCount);
  const logins = pop.map((login) => {
    const accountName = login.split(/:|\t/)[0];
    const password = login.split(/:|\t/)[1];
    return { accountName, password };
  });
  return res.json(logins);
});

app.get("/status", async (req, res, next) => {
  const isAdmin = Boolean(
    req.user && admins.includes(Number(req.user.account_id)),
  );
  const status = await buildStatus(isAdmin);
  return res.json(status);
});

app.get("/login", passport.authenticate("steam-openid"));

app.get("/return", passport.authenticate("steam-openid"), (req, res) => {
  if (config.UI_HOST) {
    return res.redirect(
      req.user
        ? `${config.UI_HOST}/players/${req.user.account_id}`
        : config.UI_HOST,
    );
  }
  return res.redirect("/api");
});

app.get("/logout", (req, res) => {
  req.logout(() => {
    req.session = null;
    if (config.UI_HOST) {
      return res.redirect(config.UI_HOST);
    }
    return res.redirect("/api");
  });
});

// req.body available after this
app.use(bodyParser.json());

app.get("/subscribeSuccess", async (req, res, next) => {
  if (!req.query.session_id) {
    return res.status(400).json({ error: "no session ID" });
  }
  if (!req.user?.account_id) {
    return res.status(400).json({ error: "no account ID" });
  }
  // look up the checkout session id: https://stripe.com/docs/payments/checkout/custom-success-page
  const session = await stripe.checkout.sessions.retrieve(
    req.query.session_id as string,
  );
  const customer = await stripe.customers.retrieve(session.customer as string);
  const accountId = Number(req.user.account_id);
  // associate the customer id with the steam account ID (req.user.account_id)
  await db.raw(
    "INSERT INTO subscriber(account_id, customer_id, status) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET account_id = EXCLUDED.account_id, customer_id = EXCLUDED.customer_id, status = EXCLUDED.status",
    [accountId, customer.id, "active"],
  );
  // Send the user back to the subscribe page
  return res.redirect(`${config.UI_HOST}/subscribe`);
});

app.post("/manageSub", async (req, res, next) => {
  if (!req.user?.account_id) {
    return res.status(400).json({ error: "no account ID" });
  }
  const result = await db.raw(
    "SELECT customer_id FROM subscriber where account_id = ? AND status = 'active'",
    [Number(req.user.account_id)],
  );
  const customer = result?.rows?.[0];
  if (!customer) {
    return res.status(400).json({ error: "customer not found" });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.customer_id,
    return_url: req.body?.return_url,
  });
  return res.json(session);
});

// CORS Preflight for API keys
// NB: make sure UI_HOST is set e.g. http://localhost:3000 otherwise CSRF check above will stop preflight from working
app.options("/keys", cors());
app.use("/keys", keys);

// Rate limiter and API key middleware
// Everything after this is rate limited
app.use(async (req, res, next) => {
  const timeStart = Date.now();
  res.once("finish", () => onResFinish(req, res, timeStart));
  const apiKey =
    req.headers.authorization?.replace("Bearer ", "") ||
    (req.query.api_key ? String(req.query.api_key) : "");
  if (
    apiKey &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      apiKey,
    )
  ) {
    return res.status(400).json({ error: "Invalid API key format" });
  }
  if (config.ENABLE_API_LIMIT && apiKey) {
    let isValidKey = Boolean(await redis.get("apiKeyCache:" + apiKey));
    if (!isValidKey) {
      // Check DB for key
      const { rows } = await db.raw(
        "select api_key from api_keys where api_key = ? and is_canceled IS NOT TRUE",
        [apiKey],
      );
      if (rows[0]) {
        await redis.setex("apiKeyCache:" + apiKey, 60, "1");
        isValidKey = true;
      }
    }
    if (!isValidKey) {
      return res
        .status(400)
        .json({
          error:
            "API key invalid. Please check the API dashboard or email support@opendota.com.",
        });
    }
    res.locals.isAPIRequest = true;
  }
  const { ip } = req;
  let rateLimit: number | string = "";
  if (res.locals.isAPIRequest) {
    res.locals.usageIdentifier = apiKey;
    rateLimit = config.API_KEY_PER_MIN_LIMIT;
  } else {
    res.locals.usageIdentifier = ip;
    rateLimit = config.NO_API_KEY_PER_MIN_LIMIT;
  }
  if (
    config.ENABLE_API_LIMIT &&
    !unlimitedPaths.includes(req.originalUrl.split("?")[0])
  ) {
    let rateCost = 1;
    if (req.method === "POST" && req.route?.path === "/request/:match_id") {
      rateCost = 10;
    }
    const command = redis.multi();
    command
      .hincrby("rate_limit", res.locals.usageIdentifier, rateCost)
      .expireat("rate_limit", getStartOfBlockMinutes(1, 1));
    command
      .hincrby("daily_rate_limit", res.locals.usageIdentifier, rateCost)
      .expireat("daily_rate_limit", getEndOfDay());
    const resp = await command.exec();
    const incrValue = resp?.[0]?.[1];
    const dailyIncrValue = resp?.[2]?.[1];
    if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
      // console.log(resp);
      console.log(
        "[WEB] %s, minute: %s, day: %s",
        req.originalUrl,
        incrValue,
        dailyIncrValue,
      );
    }
    const remMinute = Number(rateLimit) - Number(incrValue);
    const remDay = Number(config.API_FREE_LIMIT) - Number(dailyIncrValue);
    res.set({
      "X-Rate-Limit-Remaining-Minute": remMinute,
      "X-IP-Address": ip,
    });
    if (!res.locals.isAPIRequest) {
      res.set({
        "X-Rate-Limit-Remaining-Day": remDay,
      });
    }
    if (remMinute < 0) {
      return res.status(429).json({
        error: "minute rate limit exceeded",
      });
    }
    if (!res.locals.isAPIRequest && remDay < 0) {
      return res.status(429).json({
        error: "daily api limit exceeded",
      });
    }
  }
  return next();
});

// API data endpoints
app.use("/api", api);

if (config.NODE_ENV === "test") {
  app.get("/gen429", (req, res) => res.status(429).end());
  app.get("/gen500", (req, res) => res.status(500).end());
}

// 404 route
app.use((req, res) =>
  res.status(404).json({
    error: "Not Found",
  }),
);

// 500 route
app.use(
  (err: Error, req: express.Request, res: express.Response, next: ErrorCb) => {
    console.log("[ERR]", req.originalUrl, err);
    redisCount("500_error");
    if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
      // default express handler
      return next(err?.message || JSON.stringify(err));
    }
    return res.status(500).json({
      error: "Internal Server Error",
    });
  },
);

// Start the server
const port = config.PORT || config.FRONTEND_PORT;
const server = app.listen(port, () => {
  console.log("[WEB] listening on %s", port);
});

process.on("exit", (code) => {
  if (code > 0) {
    redisCount("web_crash");
  }
});
