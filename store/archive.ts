import config from '../config';
import { gzipSync, gunzipSync } from 'zlib';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3';

async function stream2buffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const _buf: any[] = [];
    stream.on('data', (chunk: any) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err: any) => reject(err));
  });
}

export class Archive {
  private endpoint: string = '';
  private accessKeyId: string = '';
  private secretAccessKey: string = '';
  private bucket: string = '';
  private client: S3Client | null = null;
  constructor(type: 'match' | 'player' | 'blob') {
    if (type === 'match') {
      this.endpoint = config.MATCH_ARCHIVE_S3_ENDPOINT;
      this.accessKeyId = config.MATCH_ARCHIVE_S3_KEY_ID;
      this.secretAccessKey = config.MATCH_ARCHIVE_S3_KEY_SECRET;
      this.bucket = config.MATCH_ARCHIVE_S3_BUCKET;
    } else if (type === 'player') {
      this.endpoint = config.PLAYER_ARCHIVE_S3_ENDPOINT;
      this.accessKeyId = config.PLAYER_ARCHIVE_S3_KEY_ID;
      this.secretAccessKey = config.PLAYER_ARCHIVE_S3_KEY_SECRET;
      this.bucket = config.PLAYER_ARCHIVE_S3_BUCKET;
    } else if (type === 'blob') {
      this.endpoint = config.BLOB_ARCHIVE_S3_ENDPOINT;
      this.accessKeyId = config.BLOB_ARCHIVE_S3_KEY_ID;
      this.secretAccessKey = config.BLOB_ARCHIVE_S3_KEY_SECRET;
      this.bucket = config.BLOB_ARCHIVE_S3_BUCKET;
    }
    this.client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      // expect the endpoint to have http prefix, if not, prepend https
      endpoint:
        (this.endpoint.startsWith('http') ? '' : 'https://') + this.endpoint,
      // put the bucket name in the path rather than the domain to avoid DNS issues with minio
      forcePathStyle: true,
      // any other options are passed to new AWS.S3()
      // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    });
  }

  public archiveGet = async (key: string) => {
    if (!this.client) {
      return null;
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    try {
      const data = await this.client.send(command);
      if (!data.Body) {
        return null;
      }
      const buffer = await stream2buffer(data.Body);
      const result = gunzipSync(buffer);
      console.log(
        '[ARCHIVE] %s: read %s bytes, decompressed %s bytes',
        key,
        buffer.length,
        result.length,
      );
      return result;
    } catch (e: any) {
      console.error('[ARCHIVE] get error:', e.Code);
      return null;
    }
  };
  public archivePut = async (
    key: string,
    blob: Buffer,
    ifNotExists?: boolean,
  ): Promise<PutObjectCommandOutput | { message: string } | null> => {
    if (!this.client) {
      return null;
    }
    if (blob.length < 50) {
      throw new Error(
        '[ARCHIVE] Tried to archive less than 10 bytes so something is probably wrong',
      );
    }
    try {
      const data = gzipSync(blob);
      const options: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
        Body: data,
      };
      if (ifNotExists) {
        options.IfNoneMatch = '*';
      }
      const command = new PutObjectCommand(options);
      const result = await this.client.send(command);
      console.log(
        '[ARCHIVE] %s: original %s bytes, archived %s bytes',
        key,
        blob.length,
        data.length,
      );
      return result;
    } catch (e: any) {
      console.error('[ARCHIVE] put error:', e.Code || e);
      if (ifNotExists && e.Code === 412) {
        // Expected error if ifNotExists was passed
        return { message: 'already exists' };
      }
      return null;
    }
  };
}
