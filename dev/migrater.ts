import os from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import cassandra, { getCassandraColumns } from "../svc/store/cassandra.ts";
import clickhouse, { getClickhouseColumns } from "../svc/store/clickhouse.ts";
import redis from "../svc/store/redis.ts";

const MIN_TOKEN = -9223372036854775808n;
const MAX_TOKEN = 9223372036854775807n;
const TOTAL_TOKEN_SPACE = 2n ** 64n;
const CHECKPOINT_PREFIX = "clickhouseMigrateCheckpoint";
const BATCH_SIZE = Number(process.env.MIGRATE_BATCH_SIZE) || 5000;
const CONCURRENCY =
  Number(process.env.MIGRATE_CONCURRENCY) || Math.max(os.cpus().length, 4);
// Estimate ~25 billion rows across the 2^64 Murmur3 token range (-2^63 to 2^63 - 1)
// Partition the token range into chunks of ~50k rows
const STEP_SIZE = (TOTAL_TOKEN_SPACE / 25000000000n) * 50000n;

type ColKind = 0 | 1 | 2 | 3; // 0: Int, 1: Float, 2: Bool, 3: String
type CompiledColumn = {
  name: string;
  kind: ColKind;
};

let compiledColsCache: CompiledColumn[] | null = null;

function compileColumns(chColumns: Record<string, string>): CompiledColumn[] {
  if (compiledColsCache) {
    return compiledColsCache;
  }
  compiledColsCache = Object.entries(chColumns).map(([name, colType]) => {
    let kind: ColKind = 0;
    if (colType.includes("String")) {
      kind = 3;
    } else if (colType.includes("Bool")) {
      kind = 2;
    } else if (colType.includes("Float")) {
      kind = 1;
    }
    return { name, kind };
  });
  return compiledColsCache;
}

export function convertCassandraRowToCompactArray(
  row: AnyDict,
  compiledCols: CompiledColumn[],
): any[] | null {
  const arr = new Array(compiledCols.length);
  for (let i = 0; i < compiledCols.length; i++) {
    const { name, kind } = compiledCols[i];
    const val = row[name];
    if (val === null || val === undefined) {
      if (name === "account_id" || name === "match_id") {
        return null;
      }
      arr[i] = null;
      continue;
    }
    const strVal = typeof val === "string" ? val : val.toString();
    if (kind === 3) {
      arr[i] = strVal;
    } else if (kind === 2) {
      arr[i] = strVal === "true" || strVal === "1";
    } else if (kind === 1) {
      const num = Number(strVal);
      arr[i] = Number.isNaN(num) ? null : num;
    } else {
      const num = Number(strVal);
      arr[i] = Number.isNaN(num) ? null : Math.trunc(num);
    }
  }
  return arr;
}

export async function migrateRange(
  begin: bigint,
  end: bigint,
  isLastRange = false,
): Promise<number> {
  const [, chColumns] = await Promise.all([
    getCassandraColumns("player_caches"),
    getClickhouseColumns("player_caches"),
  ]);
  const compiledCols = compileColumns(chColumns);
  const colNames = compiledCols.map((c) => c.name);
  const upperOp = isLastRange ? "<=" : "<";
  const query = `SELECT * FROM player_caches WHERE token(account_id) >= ? AND token(account_id) ${upperOp} ?`;

  let count = 0;
  let buffer: any[][] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = cassandra.stream(
      query,
      [begin.toString(), end.toString()],
      {
        prepare: true,
        fetchSize: 2000,
        autoPage: true,
      },
    ) as unknown as NodeJS.ReadableStream;

    stream.on("readable", async function () {
      let row: any;
      //@ts-expect-error
      while ((row = this.read())) {
        const chArr = convertCassandraRowToCompactArray(row, compiledCols);
        if (chArr !== null) {
          buffer.push(chArr);
          count += 1;
        }
        if (buffer.length >= BATCH_SIZE) {
          stream.pause();
          const toFlush = buffer;
          buffer = [];
          try {
            await clickhouse.insertCompact("player_caches", colNames, toFlush);
            stream.resume();
          } catch (err) {
            reject(err);
            return;
          }
        }
      }
    });

    stream.on("end", async () => {
      try {
        if (buffer.length > 0) {
          await clickhouse.insertCompact("player_caches", colNames, buffer);
          buffer = [];
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });

  return count;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }
  const totalSec = Math.round(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

type ShardProgress = {
  shardIndex: number;
  rows: number;
  runTokensDone: bigint;
  totalTokensDone: bigint;
  shardSpan: bigint;
};

export async function runShardWorker(
  shardIndex: number,
  numShards: number,
  stepSize = STEP_SIZE,
  onProgress?: (progress: ShardProgress) => void,
): Promise<number> {
  const shardSpan = TOTAL_TOKEN_SPACE / BigInt(numShards);
  const shardStart = MIN_TOKEN + shardSpan * BigInt(shardIndex);
  const isFinalShard = shardIndex === numShards - 1;
  const shardEnd = isFinalShard
    ? MAX_TOKEN
    : MIN_TOKEN + shardSpan * BigInt(shardIndex + 1);
  const actualShardSpan = shardEnd - shardStart;
  const checkpointKey = `${CHECKPOINT_PREFIX}:${numShards}:${shardIndex}`;

  let totalShardCount = 0;
  const shardRunStartTime = Date.now();
  let shardInitialBegin: bigint | null = null;

  while (true) {
    const saved = await redis.get(checkpointKey);
    const begin = saved ? BigInt(saved) : shardStart;
    if (shardInitialBegin === null) {
      shardInitialBegin = begin;
    }
    if (begin > shardEnd || (!isFinalShard && begin >= shardEnd)) {
      console.log(
        "[MIGRATE shard %d/%d] Already complete.",
        shardIndex,
        numShards,
      );
      onProgress?.({
        shardIndex,
        rows: totalShardCount,
        runTokensDone: 0n,
        totalTokensDone: actualShardSpan,
        shardSpan: actualShardSpan,
      });
      break;
    }

    const isLastRangeInShard = begin + stepSize >= shardEnd;
    const end = isLastRangeInShard ? shardEnd : begin + stepSize;
    // Only the very last range of the final shard needs `<= MAX_TOKEN`; all other ranges use `< end`
    const inclusiveUpper = isFinalShard && isLastRangeInShard;

    const startTime = Date.now();
    const count = await migrateRange(begin, end, inclusiveUpper);
    totalShardCount += count;
    const now = Date.now();
    const elapsed = now - startTime;
    const totalShardElapsed = now - shardRunStartTime;

    const rangeRate = elapsed > 0 ? Math.round((count * 1000) / elapsed) : 0;
    const runTokensDone = end - shardInitialBegin;
    const remainingTokens = shardEnd - end;
    const shardEtaMs =
      runTokensDone > 0n
        ? Number((remainingTokens * BigInt(totalShardElapsed)) / runTokensDone)
        : 0;

    const pct = (
      Number(((end - shardStart) * 10000n) / actualShardSpan) / 100
    ).toFixed(2);
    console.log(
      "[MIGRATE shard %d/%d (%s%%)] token range [%s, %s]: %s rows in %sms (%s rows/s, shard ETA: %s, total: %s)",
      shardIndex,
      numShards,
      pct,
      begin.toString(),
      end.toString(),
      count,
      elapsed,
      rangeRate,
      formatDuration(shardEtaMs),
      totalShardCount,
    );

    onProgress?.({
      shardIndex,
      rows: totalShardCount,
      runTokensDone,
      totalTokensDone: end - shardStart,
      shardSpan: actualShardSpan,
    });

    const nextBegin = isLastRangeInShard ? shardEnd + 1n : end;
    await redis.set(checkpointKey, nextBegin.toString());

    if (isLastRangeInShard) {
      console.log(
        "[MIGRATE shard %d/%d] Finished shard (%s rows in %s).",
        shardIndex,
        numShards,
        totalShardCount,
        formatDuration(totalShardElapsed),
      );
      break;
    }
  }

  return totalShardCount;
}

function spawnShardWorkerThread(
  shardIndex: number,
  numShards: number,
  stepSize: bigint,
  onProgress?: (progress: ShardProgress) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        shardIndex,
        numShards,
        stepSize: stepSize.toString(),
      },
    });
    let resultCount = 0;
    worker.on("message", (msg) => {
      if (msg?.type === "progress") {
        onProgress?.({
          shardIndex: msg.shardIndex,
          rows: msg.rows,
          runTokensDone: BigInt(msg.runTokensDone),
          totalTokensDone: BigInt(msg.totalTokensDone),
          shardSpan: BigInt(msg.shardSpan),
        });
      } else if (typeof msg?.count === "number") {
        resultCount = msg.count;
      }
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker thread ${shardIndex} exited with code ${code}`));
      } else {
        resolve(resultCount);
      }
    });
  });
}

export async function runMigration(
  concurrency = CONCURRENCY,
  stepSize = STEP_SIZE,
  useWorkerThreads = false,
): Promise<number> {
  console.log(
    "[MIGRATE] Starting migration with %d parallel shard workers (workerThreads=%s, batchSize=%d)...",
    concurrency,
    useWorkerThreads,
    BATCH_SIZE,
  );
  const runStartTime = Date.now();
  const shardStates = new Map<number, ShardProgress>();
  const handleProgress = (p: ShardProgress) => {
    shardStates.set(p.shardIndex, p);
  };

  const logOverallProgress = () => {
    if (shardStates.size === 0) return;
    let totalRows = 0;
    let totalRunTokens = 0n;
    let totalDoneTokens = 0n;
    for (const s of shardStates.values()) {
      totalRows += s.rows;
      totalRunTokens += s.runTokensDone;
      totalDoneTokens += s.totalTokensDone;
    }
    const elapsedMs = Date.now() - runStartTime;
    const rowsPerSec =
      elapsedMs > 0 ? Math.round((totalRows * 1000) / elapsedMs) : 0;
    const pct = (
      Number((totalDoneTokens * 10000n) / TOTAL_TOKEN_SPACE) / 100
    ).toFixed(2);
    const remainingTokens = TOTAL_TOKEN_SPACE - totalDoneTokens;
    const etaMs =
      totalRunTokens > 0n
        ? Number((remainingTokens * BigInt(elapsedMs)) / totalRunTokens)
        : 0;
    console.log(
      "[MIGRATE OVERALL %s%%] %s rows migrated | %s rows/s | elapsed: %s | ETA: %s",
      pct,
      totalRows,
      rowsPerSec,
      formatDuration(elapsedMs),
      formatDuration(etaMs),
    );
  };

  const progressTimer = setInterval(logOverallProgress, 10000);
  progressTimer.unref();

  try {
    const counts = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        useWorkerThreads
          ? spawnShardWorkerThread(i, concurrency, stepSize, handleProgress)
          : runShardWorker(i, concurrency, stepSize, handleProgress),
      ),
    );
    const total = counts.reduce((acc, c) => acc + c, 0);
    const totalElapsed = Date.now() - runStartTime;
    const avgRate =
      totalElapsed > 0 ? Math.round((total * 1000) / totalElapsed) : 0;
    console.log(
      "[MIGRATE] All %d shards completed. Total rows migrated: %d in %s (%d rows/s)",
      concurrency,
      total,
      formatDuration(totalElapsed),
      avgRate,
    );
    return total;
  } finally {
    clearInterval(progressTimer);
  }
}

if (!isMainThread && workerData) {
  const count = await runShardWorker(
    workerData.shardIndex,
    workerData.numShards,
    BigInt(workerData.stepSize),
    (p) => {
      parentPort?.postMessage({
        type: "progress",
        shardIndex: p.shardIndex,
        rows: p.rows,
        runTokensDone: p.runTokensDone.toString(),
        totalTokensDone: p.totalTokensDone.toString(),
        shardSpan: p.shardSpan.toString(),
      });
    },
  );
  parentPort?.postMessage({ count });
  process.exit(0);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigration(CONCURRENCY, STEP_SIZE, true);
  process.exit(0);
}
