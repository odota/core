import type {
  PutObjectCommandInput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3';
import config from '../../config.ts';
import { gzipSync, gunzipSync } from 'zlib';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { redisCount } from '../util/utility.ts';
import axios from 'axios';
import redis from './redis.ts';

async function stream2buffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const _buf: any[] = [];
    stream.on('data', (chunk: any) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err: any) => reject(err));
  });
}

type ArchiveType = 'match' | 'player' | 'blob';
class Archive {
  private endpoint: string = '';
  private accessKeyId: string = '';
  private secretAccessKey: string = '';
  private bucket: string = '';
  private client: S3Client | null = null;
  private type: ArchiveType | null = null;
  constructor(type: ArchiveType) {
    this.endpoint = config.ARCHIVE_S3_ENDPOINT;
    this.accessKeyId = config.ARCHIVE_S3_KEY_ID;
    this.secretAccessKey = config.ARCHIVE_S3_KEY_SECRET;
    this.type = type;
    if (type === 'match') {
      this.bucket = config.MATCH_ARCHIVE_S3_BUCKET;
    } else if (type === 'player') {
      this.bucket = config.PLAYER_ARCHIVE_S3_BUCKET;
    } else if (type === 'blob') {
      this.bucket = config.BLOB_ARCHIVE_S3_BUCKET;
    }
    this.client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      // expect the endpoint to have http prefix, if not, prepend https
      endpoint: this.endpoint,
      // put the bucket name in the path rather than the domain to avoid DNS issues with minio
      forcePathStyle: true,
      // any other options are passed to new AWS.S3()
      // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    });
  }

  public archiveGet = async (key: string) => {
    if (this.type === 'blob') {
      const cache = await redis?.get(`cache:${key}`);
      if (cache) {
        redisCount(`cache_${key.split('_')[1]}_hit` as MetricName);
        return JSON.parse(cache);
      }
    }
    let buffer: Buffer | undefined;
    if (config.ARCHIVE_PUBLIC_URL) {
      // if the bucket is public, we can read via http request rather than using the s3 client
      const url = `${config.ARCHIVE_PUBLIC_URL}/${this.bucket}/${key}`;
      try {
        const resp = await axios.get<Buffer>(url, {
          timeout: 5000,
          responseType: 'arraybuffer',
        });
        buffer = resp.data;
      } catch (e) {
        if (axios.isAxiosError(e)) {
          if (e.response?.status === 404) {
            // expected if key not valid
            redisCount('archive_miss');
            return null;
          }
        }
        redisCount('archive_get_error');
        throw e;
      }
    } else {
      if (!this.client) {
        return null;
      }
      try {
        const data = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
          }),
        );
        if (!data.Body) {
          return null;
        }
        buffer = await stream2buffer(data.Body);
      } catch (e: any) {
        if (e.Code === 'NoSuchKey') {
          // expected response if key not valid
          redisCount('archive_miss');
          return null;
        }
        redisCount('archive_get_error');
        throw e;
      }
    }
    redisCount('archive_hit');
    redisCount('archive_read_bytes', buffer.length);
    const unzip = gunzipSync(buffer);
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      console.log(
        '[ARCHIVE] %s: read %s bytes, decompressed %s bytes',
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
  ): Promise<PutObjectCommandOutput | null> => {
    if (!this.client) {
      return null;
    }
    if (blob.length < 50) {
      throw new Error(
        '[ARCHIVE] Tried to archive small blob so something is probably wrong',
      );
    }
    try {
      const zip = gzipSync(blob);
      const options: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
        Body: zip,
      };
      // if (ifNotExists) {
      //   // May not be implemented by some s3 providers
      //   options.IfNoneMatch = '*';
      // }
      const command = new PutObjectCommand(options);
      const result = await this.client.send(command);
      redisCount('archive_write_bytes', zip.length);
      if (this.type === 'blob' && !noCache) {
        // Cache the data for some time (could cache compressed blob for storage improvement?)
        await redis?.setex(`cache:${key}`, 3600, blob);
      }
      if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
        console.log(
          '[ARCHIVE] %s: original %s bytes, archived %s bytes',
          key,
          blob.length,
          zip.length,
        );
      }
      return result;
    } catch (e: any) {
      console.error('[ARCHIVE] put error:', e.Code || e);
      // if (ifNotExists && e.Code === 'PreconditionFailed') {
      //   // Expected error if ifNotExists was passed
      //   return { message: 'already exists' };
      // }
      redisCount('archive_put_error');
      throw e;
    }
  };
}

export const blobArchive = new Archive('blob');
export const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive('player')
  : null;
export const matchArchive = new Archive('match');
