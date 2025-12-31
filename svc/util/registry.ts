import config from "../../config.ts";
import redis from "../store/redis.ts";

const RETRIEVER_ARRAY: string[] = makeUrlArray(config.RETRIEVER_HOST);
const PARSER_ARRAY: string[] = makeUrlArray(config.PARSER_HOST);

/**
 * Generate a list of URLs to use for data retrieval. Supports weighting using the size URL query parameter
 * @param input Comma separated URLs
 * @returns Array of URLs
 */
function makeUrlArray(input: string) {
  const output: string[] = [];
  const arr = input.split(",");
  arr.forEach((element) => {
    if (!element) {
      return;
    }
    const parsedUrl = new URL("http://" + element);
    for (
      let i = 0;
      i < (Number(parsedUrl.searchParams.get("size")) || 1);
      i += 1
    ) {
      output.push(String(parsedUrl.host));
    }
  });
  return output;
}

export async function getParserCapacity() {
  if (config.USE_SERVICE_REGISTRY) {
    return redis.zcard("registry:parser");
  }
  return Number(config.PARSER_PARALLELISM);
}

export async function getRetrieverCapacity() {
  if (config.USE_SERVICE_REGISTRY) {
    return redis.zcard("registry:retriever");
  }
  return RETRIEVER_ARRAY.length;
}

/**
 * Return a URL to use for GC data retrieval.
 * @returns
 */
export async function getRandomRetrieverUrl(path: string): Promise<string> {
  if (config.USE_SERVICE_REGISTRY) {
    return getRegistryUrl("retriever", path);
  }
  const urls = RETRIEVER_ARRAY.map((r) => {
    return `http://${r}${path}?key=${config.RETRIEVER_SECRET}`;
  });
  return urls[Math.floor(Math.random() * urls.length)];
}

/**
 * Return a URL to use for replay parsing.
 * @returns
 */
export async function getRandomParserUrl(path: string): Promise<string> {
  if (config.USE_SERVICE_REGISTRY) {
    return getRegistryUrl("parser", path);
  }
  const urls = PARSER_ARRAY.map((r) => {
    return `http://${r}${path}`;
  });
  return urls[Math.floor(Math.random() * urls.length)];
}

async function getRegistryUrl(service: string, path: string) {
  // Purge values older than 10 seconds (stale heartbeat)
  await redis.zremrangebyscore(
    "registry:" + service,
    "-inf",
    Date.now() - 10000,
  );
  const hostWithId = await redis.zrandmember("registry:" + service);
  const host = hostWithId?.split("?")[0];
  return `http://${host}${path}${
    service === "retriever" ? `?key=${config.RETRIEVER_SECRET}` : ""
  }`;
}
