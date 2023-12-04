import config from '../config.js';
import { gzipSync, gunzipSync } from 'zlib';
import clientS3 from '@aws-sdk/client-s3';
const { S3Client, PutObjectCommand, GetObjectCommand } = clientS3;
const client = config.MATCH_ARCHIVE_S3_ENDPOINT
  ? new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: config.MATCH_ARCHIVE_S3_KEY_ID,
        secretAccessKey: config.MATCH_ARCHIVE_S3_KEY_SECRET,
      },
      endpoint: 'https://' + config.MATCH_ARCHIVE_S3_ENDPOINT,
      // any other options are passed to new AWS.S3()
      // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
    })
  : null;
async function stream2buffer(stream) {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on('data', (chunk) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err) => reject(err));
  });
}
export async function archiveGet(key) {
  if (!client) {
    return null;
  }
  const command = new GetObjectCommand({
    Bucket: config.MATCH_ARCHIVE_S3_BUCKET,
    Key: key,
  });
  try {
    const data = await client.send(command);
    if (!data.Body) {
      return null;
    }
    const buffer = await stream2buffer(data.Body);
    const result = gunzipSync(buffer);
    console.log(
      '[ARCHIVE] %s: read %s bytes, decompressed %s bytes',
      key,
      buffer.length,
      result.length
    );
    return result;
  } catch (e) {
    console.error('[ARCHIVE] get error:', e.Code);
    return null;
  }
}
export async function archivePut(key, blob) {
  if (!client) {
    return null;
  }
  try {
    const data = gzipSync(blob);
    const command = new PutObjectCommand({
      Bucket: config.MATCH_ARCHIVE_S3_BUCKET,
      Key: key,
      Body: data,
    });
    const result = await client.send(command);
    console.log(
      '[ARCHIVE] %s: original %s bytes, archived %s bytes',
      key,
      blob.length,
      data.length
    );
    return result;
  } catch (e) {
    console.error('[ARCHIVE] put error:', e.Code);
    return null;
  }
}
export default {
  archiveGet,
  archivePut,
};
