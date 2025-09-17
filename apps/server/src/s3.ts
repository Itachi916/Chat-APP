import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ 
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  }
});
const bucket = process.env.S3_BUCKET_NAME as string;

export { s3 };

export async function getPresignedUploadUrl(key: string, contentType: string) {
  try {
    console.log('S3 Config:', {
      region: process.env.AWS_REGION,
      bucket: bucket,
      key: key,
      contentType: contentType
    });
    
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 }); // 5 minutes
    
    console.log('Generated presigned URL:', url);
    return url;
  } catch (error) {
    console.error('S3 presigned URL generation error:', error);
    throw error;
  }
}

export async function getPresignedDownloadUrl(key: string, expiresIn: number = 60 * 60 * 24) { // Default 1 day
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn }); // 1 day by default
}

