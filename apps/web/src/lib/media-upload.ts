// Client-side media upload with duplicate detection
// This file demonstrates the new presigned URL flow with proper duplicate handling

import crypto from 'crypto-js';

interface MediaUploadResult {
  id: string;
  key: string;
  url: string;
  fileName: string;
  fileType: string;
  size: number;
  isDuplicate?: boolean;
}

interface DuplicateCheckResponse {
  isDuplicate: boolean;
  existingMedia?: {
    id: string;
    s3Key: string;
    s3Url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  };
}

interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  mediaId: string;
  s3Url: string;
  expiresIn: number;
}

// Calculate MD5 hash of file content
export function calculateFileHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const wordArray = crypto.lib.WordArray.create(arrayBuffer);
        const hash = crypto.MD5(wordArray).toString();
        resolve(hash);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Upload file with duplicate detection
export async function uploadFileWithDuplicateDetection(
  file: File,
  conversationId: string,
  messageId?: string,
  authToken?: string
): Promise<MediaUploadResult> {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  
  if (!authToken) {
    throw new Error('Authentication token required');
  }

  try {
    // Step 1: Calculate content hash
    console.log('Calculating file hash...');
    const contentHash = await calculateFileHash(file);
    console.log('File hash:', contentHash);

    // Step 2: Check for duplicates
    console.log('Checking for duplicates...');
    const duplicateCheckResponse = await fetch(
      `${serverUrl}/api/media/check-duplicate/${conversationId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          contentHash,
          fileName: file.name,
          fileType: file.type,
        }),
      }
    );

    if (!duplicateCheckResponse.ok) {
      throw new Error('Failed to check for duplicates');
    }

    const duplicateCheck: DuplicateCheckResponse = await duplicateCheckResponse.json();

    if (duplicateCheck.isDuplicate && duplicateCheck.existingMedia) {
      // Step 3a: File is duplicate, create new media record pointing to existing S3 file
      console.log('File is duplicate, creating new media record...');
      const duplicateResponse = await fetch(
        `${serverUrl}/api/media/create-duplicate-media/${conversationId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            existingMediaId: duplicateCheck.existingMedia.id,
            messageId,
            fileName: file.name,
            fileType: file.type,
          }),
        }
      );

      if (!duplicateResponse.ok) {
        throw new Error('Failed to create duplicate media record');
      }

      const result: MediaUploadResult = await duplicateResponse.json();
      console.log('Duplicate file handled:', result);
      return result;
    }

    // Step 3b: File is not duplicate, get presigned URL and upload
    console.log('File is unique, getting presigned URL...');
    const presignedResponse = await fetch(
      `${serverUrl}/api/media/upload-url/${conversationId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          messageId,
          contentHash,
        }),
      }
    );

    if (!presignedResponse.ok) {
      throw new Error('Failed to get presigned URL');
    }

    const presignedData: PresignedUrlResponse = await presignedResponse.json();
    console.log('Got presigned URL:', presignedData);

    // Step 4: Upload file to S3
    console.log('Uploading file to S3...');
    const uploadResponse = await fetch(presignedData.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to S3');
    }

    // Step 5: Confirm upload and update media record
    console.log('Confirming upload...');
    const confirmResponse = await fetch(`${serverUrl}/api/media/confirm-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        mediaId: presignedData.mediaId,
        fileSize: file.size,
        // Add width, height, duration, thumbnailUrl if available
      }),
    });

    if (!confirmResponse.ok) {
      throw new Error('Failed to confirm upload');
    }

    const result: MediaUploadResult = await confirmResponse.json();
    console.log('File uploaded successfully:', result);
    return result;

  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

// Example usage in a React component:
/*
import { uploadFileWithDuplicateDetection } from '@/lib/media-upload';

const handleFileUpload = async (file: File) => {
  try {
    const result = await uploadFileWithDuplicateDetection(
      file,
      conversationId,
      messageId,
      authToken
    );
    
    if (result.isDuplicate) {
      console.log('File was a duplicate, reused existing S3 file');
    } else {
      console.log('File was uploaded to S3');
    }
    
    // Use result.id for message attachment
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
*/
