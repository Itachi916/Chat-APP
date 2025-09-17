import React, { memo, useState, useEffect } from 'react';
import { Message, Media } from '../types';

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  onDeleteMessage: (messageId: string) => void;
  formatTime: (timestamp: string) => string;
  getMediaViewUrl: (mediaId: string) => Promise<string | null>;
  onImageClick: (url: string, fileName: string) => void;
}

// Memoized media components with proper URL fetching
const MediaImage = memo(({ media, getMediaViewUrl, onImageClick }: { 
  media: Media; 
  getMediaViewUrl: (mediaId: string) => Promise<string | null>;
  onImageClick: (url: string, fileName: string) => void;
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchImageUrl = async () => {
      try {
        setLoading(true);
        const url = await getMediaViewUrl(media.id);
        if (url) {
          setImageUrl(url);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching image URL:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImageUrl();
  }, [media.id, getMediaViewUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 rounded">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 rounded text-gray-500">
        Failed to load image
      </div>
    );
  }

  return (
    <div className="relative group">
      <img
        src={imageUrl}
        alt={media.fileName}
        className="max-w-full h-auto rounded-lg cursor-pointer"
        onClick={() => onImageClick(imageUrl, media.fileName)}
      />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center pointer-events-none">
        <span className="text-white opacity-0 group-hover:opacity-100 text-sm">Click to view</span>
      </div>
    </div>
  );
});

MediaImage.displayName = 'MediaImage';

const MediaVideo = memo(({ media, getMediaViewUrl }: { 
  media: Media; 
  getMediaViewUrl: (mediaId: string) => Promise<string | null>;
}) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchVideoUrl = async () => {
      try {
        setLoading(true);
        const url = await getMediaViewUrl(media.id);
        if (url) {
          setVideoUrl(url);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching video URL:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoUrl();
  }, [media.id, getMediaViewUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 rounded">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 rounded text-gray-500">
        Failed to load video
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        src={videoUrl}
        controls
        className="max-w-full h-auto rounded-lg"
        preload="metadata"
      />
    </div>
  );
});

MediaVideo.displayName = 'MediaVideo';

const MessageItem = memo(({ message, isOwnMessage, onDeleteMessage, formatTime, getMediaViewUrl, onImageClick }: MessageItemProps) => {
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-xs lg:max-w-md rounded-lg relative ${
        message.messageType === 'IMAGE' || message.messageType === 'VIDEO'
          ? 'bg-white'
          : isOwnMessage 
            ? 'bg-blue-500 text-white px-4 py-2' 
            : 'bg-gray-200 text-gray-800 px-4 py-2'
      }`}>
        {message.messageType === 'TEXT' && (
          <div>{message.content}</div>
        )}
        {message.messageType === 'IMAGE' && message.media[0] && (
          <div className="pb-6">
            <MediaImage 
              media={message.media[0]} 
              getMediaViewUrl={getMediaViewUrl}
              onImageClick={onImageClick}
            />
          </div>
        )}
        {message.messageType === 'VIDEO' && message.media[0] && (
          <div className="pb-6">
            <MediaVideo 
              media={message.media[0]} 
              getMediaViewUrl={getMediaViewUrl}
            />
          </div>
        )}
        <div className={`flex justify-between items-center ${
          message.messageType === 'IMAGE' || message.messageType === 'VIDEO'
            ? 'bg-gray-200 text-gray-800 px-2 py-1 -mx-1 -mb-1 rounded-b-lg absolute bottom-0 left-0 right-0'
            : 'mt-1'
        }`}>
          <div className="text-xs opacity-75">
            {formatTime(message.createdAt)}
          </div>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this message?')) {
                onDeleteMessage(message.id);
              }
            }}
            className={`ml-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
              isOwnMessage 
                ? 'text-blue-100 hover:text-white' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Delete message"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
