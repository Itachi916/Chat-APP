import React from 'react';

interface VideoUploadProgressProps {
  isUploading: boolean;
  progress: number;
  fileName: string;
  fileSize: number;
  thumbnail: string;
  onCancel: () => void;
}

const VideoUploadProgress: React.FC<VideoUploadProgressProps> = ({
  isUploading,
  progress,
  fileName,
  fileSize,
  thumbnail,
  onCancel
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isUploading) return null;

  return (
    <div className="p-4 border-t bg-gray-50">
      <div className="flex items-center space-x-4">
        {/* Video Thumbnail */}
        <div className="relative w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
          {thumbnail && thumbnail.trim() !== '' ? (
            <video
              src={thumbnail}
              className="w-full h-full object-cover"
              muted
            />
          ) : (
            <div className="w-full h-full bg-gray-300 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 5v10l8-5-8-5z" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
            <div className="w-8 h-8 bg-white bg-opacity-80 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 5v10l8-5-8-5z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Upload Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-800 truncate">{fileName}</p>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Cancel upload"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
            <span>{formatFileSize(fileSize)}</span>
            <span>{Math.round(progress)}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Status Text */}
          <p className="text-xs text-gray-500 mt-1">
            {progress < 100 ? 'Uploading...' : 'Processing...'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoUploadProgress;
