import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import 'dotenv/config';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const bucket = process.env.S3_BUCKET;

export async function uploadPdf(key, buffer) {
  if (!bucket) throw new Error('S3_BUCKET is not configured');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
    ServerSideEncryption: 'AES256'
  }));
}

export async function createDownloadUrl(key) {
  if (!bucket) throw new Error('S3_BUCKET is not configured');
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: Number(process.env.PRESIGNED_URL_EXPIRES || 900) }
  );
}

export async function deletePdf(key) {
  if (!bucket) throw new Error('S3_BUCKET is not configured');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
