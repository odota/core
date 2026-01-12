import config from "../../config.ts";
import { gzipSync, gunzipSync } from "node:zlib";
import redis, { redisCount } from "./redis.ts";
import {
  S3Client,
  type S3UploadedObjectInfo,
  type S3Errors,
} from "@bradenmacdonald/s3-lite-client";

type ArchiveType = "match" | "player" | "blob";
class Archive {
  private endpoint: string = "";
  private accessKeyId: string = "";
  private secretAccessKey: string = "";
  private bucket: string = "";
  private client: S3Client | null = null;
  private type: ArchiveType | null = null;
  constructor(type: ArchiveType) {
    this.endpoint = config.ARCHIVE_S3_ENDPOINT;
    this.accessKeyId = config.ARCHIVE_S3_KEY_ID;
    this.secretAccessKey = config.ARCHIVE_S3_KEY_SECRET;
    this.type = type;
    if (type === "match") {
      this.bucket = config.MATCH_ARCHIVE_S3_BUCKET;
    } else if (type === "player") {
      this.bucket = config.PLAYER_ARCHIVE_S3_BUCKET;
    } else if (type === "blob") {
      this.bucket = config.BLOB_ARCHIVE_S3_BUCKET;
    }
    this.client = new S3Client({
      endPoint: this.endpoint,
      region: "local",
      bucket: this.bucket,
      accessKey: this.accessKeyId,
      secretKey: this.secretAccessKey,
      // put the bucket name in the path rather than the domain to avoid DNS issues with minio
      // forcePathStyle: true,
    });
  }

  public archiveGet = async (key: string) => {
    if (this.type === "blob") {
      const cache = await redis?.getBuffer(`cache5:${key}`);
      if (cache) {
        redisCount(`cache_${key.split("_")[1]}_hit` as MetricName);
        return gunzipSync(cache);
      }
    }
    let buffer: Buffer | undefined;
    if (config.ARCHIVE_PUBLIC_URL) {
      // if the bucket is public, we can read via http request rather than using the s3 client
      const url = `${config.ARCHIVE_PUBLIC_URL}/${this.bucket}/${key}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.status === 404) {
        // expected if key not valid
        redisCount("archive_miss");
        return null;
      }
      if (!resp.ok) {
        redisCount("archive_get_error");
        throw new Error(`[ARCHIVE] fetch was not ok (${resp.status})`);
      }
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      if (!this.client) {
        throw new Error("[ARCHIVE] s3 client not available");
      }
      try {
        const data = await this.client.getObject(key);
        buffer = Buffer.from(await data.arrayBuffer());
      } catch (e: unknown) {
        const error = e as S3Errors.ServerError;
        if (error.statusCode === 404) {
          // expected response if key not valid
          redisCount("archive_miss");
          return null;
        }
        redisCount("archive_get_error");
        throw e;
      }
    }
    redisCount("archive_hit");
    redisCount("archive_read_bytes", buffer.length);
    const unzip = gunzipSync(buffer);
    if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
      console.log(
        "[ARCHIVE] %s: read %s bytes, decompressed %s bytes",
        key,
        buffer.length,
        unzip.length,
      );
    }
    return unzip;
  };
  public archivePut = async (
    key: string,
    blob: Buffer,
    noCache = false,
  ): Promise<S3UploadedObjectInfo | null> => {
    if (!this.client) {
      throw new Error("[ARCHIVE] s3 client not available");
    }
    if (blob.length < 50) {
      throw new Error(
        "[ARCHIVE] Tried to archive small blob so something is probably wrong",
      );
    }
    const zip = gzipSync(blob);
    let result;
    try {
      // if (ifNotExists) {
      //   // May not be implemented by some s3 providers
      //   options.IfNoneMatch = '*';
      // }
      result = await this.client.putObject(key, zip);
    } catch (e: unknown) {
      const error = e as S3Errors.ServerError;
      console.log(
        "[ARCHIVE] put error [key: %s] (%s): %s",
        key,
        error.code,
        error.message,
      );
      // if (ifNotExists && e.Code === 'PreconditionFailed') {
      //   // Expected error if ifNotExists was passed
      //   return { message: 'already exists' };
      // }
      redisCount("archive_put_error");
      throw e;
    }

    redisCount("archive_write_bytes", zip.length);
    if (this.type === "blob" && !noCache) {
      // Cache the data for some time
      await redis?.setex(`cache5:${key}`, config.BLOB_CACHE_SECONDS, zip);
    }
    if (config.NODE_ENV === "development" || config.NODE_ENV === "test") {
      console.log(
        "[ARCHIVE] %s: original %s bytes, archived %s bytes",
        key,
        blob.length,
        zip.length,
      );
    }
    return result;
  };
}

export const blobArchive = new Archive("blob");
export const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive("player")
  : null;
export const matchArchive = new Archive("match");
