const config = require("../config");
const { gzipSync, gunzipSync } = require('zlib');
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const client = config.MATCH_ARCHIVE_S3_ENDPOINT ? new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: config.MATCH_ARCHIVE_S3_KEY_ID,
        secretAccessKey: config.MATCH_ARCHIVE_S3_KEY_SECRET,
    },
    endpoint: 'https://' + config.MATCH_ARCHIVE_S3_ENDPOINT,
    // any other options are passed to new AWS.S3()
    // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
}) : null;

async function stream2buffer(stream) {
    return new Promise((resolve, reject) => {
        const _buf = [];
        stream.on("data", (chunk) => _buf.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(_buf)));
        stream.on("error", (err) => reject(err));
    });
}

async function archiveGet(key) {
    if (!client) {
        return;
    }
    const command = new GetObjectCommand({
        Bucket: config.MATCH_ARCHIVE_S3_BUCKET,
        Key: key,
    });
    try {
        const data = await client.send(command);
        if (!data.Body) {
            return;
        }
        const buffer = await stream2buffer(data.Body);
        const result = gunzipSync(buffer);
        console.log('[ARCHIVE] read %s bytes, decompressed %s bytes', buffer.length, result.length);
        return result;
    } catch (e) {
        return;
    }
}

async function archivePut(key, blob) {
    if (!client) {
        return;
    }
    const data = gzipSync(blob);
    const command = new PutObjectCommand({
        Bucket: config.MATCH_ARCHIVE_S3_BUCKET,
        Key: key,
        Body: data,
    });
    const result = await client.send(command);
    console.log('[ARCHIVE] original %s bytes, archived %s bytes', blob.length, data.length);
    return result;
}

module.exports = {
    archiveGet,
    archivePut,
};