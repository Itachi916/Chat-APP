import React, { memo, useRef, useEffect } from 'react';
import { Message } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  onDeleteMessage: (messageId: string) => void;
  formatTime: (timestamp: string) => string;
  getMediaViewUrl: (mediaId: string) => Promise<string | null>;
  onImageClick: (url: string, fileName: string, mediaId: string) => void;
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  shouldScrollToBottom?: boolean;
  onScrollComplete?: () => void;
  onScrollToBottom?: () => void;
}

const MessageList = memo(({ 
  messages, 
  currentUserId, 
  onDeleteMessage, 
  formatTime, 
  getMediaViewUrl, 
  onImageClick, 
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore,
  shouldScrollToBottom = false,
  onScrollComplete,
  onScrollToBottom
}: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);

  // SIMPLE: Only scroll when explicitly told to
  useEffect(() => {
    if (shouldScrollToBottom && messages.length > 0 && containerRef.current) {
      console.log('Explicit scroll to bottom requested');
      
      // Store current scroll position before loading more messages
      if (isLoadingMore && containerRef.current) {
        previousScrollHeightRef.current = containerRef.current.scrollHeight;
      }
      
      // Scroll to bottom
      const scrollToBottom = () => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      };
      
      // Multiple attempts to ensure scroll happens
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 200);
      
      // Notify parent that scroll is complete
      if (onScrollComplete) {
        setTimeout(() => {
          onScrollComplete();
        }, 300);
      }
    }
  }, [shouldScrollToBottom, messages.length, isLoadingMore, onScrollComplete]);

  // Handle loading more messages - preserve scroll position
  useEffect(() => {
    if (isLoadingMore && previousScrollHeightRef.current > 0 && containerRef.current) {
      console.log('Restoring scroll position after loading more messages');
      const heightDifference = containerRef.current.scrollHeight - previousScrollHeightRef.current;
      containerRef.current.scrollTop = containerRef.current.scrollTop + heightDifference;
      previousScrollHeightRef.current = 0;
    }
  }, [isLoadingMore]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 h-0 relative">
      {/* Load Previous Messages Button */}
      {hasMoreMessages && onLoadMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoadingMore ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Loading...</span>
              </div>
            ) : (
              'Load Previous Messages'
            )}
          </button>
        </div>
      )}
      
      {Array.isArray(messages) && messages.map((message) => {
        const isOwnMessage = message.sender?.firebaseUid === currentUserId;
        return (
          <MessageItem
            key={message.id}
            message={message}
            isOwnMessage={isOwnMessage}
            onDeleteMessage={onDeleteMessage}
            formatTime={formatTime}
            getMediaViewUrl={getMediaViewUrl}
            onImageClick={onImageClick}
          />
        );
      })}
      <div ref={messagesEndRef} />
      
      {/* Simple scroll to bottom button */}
      {onScrollToBottom && (
        <div className="flex justify-center py-2">
          <button
            onClick={onScrollToBottom}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
          >
            Scroll to Bottom
          </button>
        </div>
      )}
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
