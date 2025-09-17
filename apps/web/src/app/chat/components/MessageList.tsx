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
  isInitialLoad?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const MessageList = memo(({ 
  messages, 
  currentUserId, 
  onDeleteMessage, 
  formatTime, 
  getMediaViewUrl, 
  onImageClick, 
  isInitialLoad = false,
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore
}: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const isScrollingToBottomRef = useRef<boolean>(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current && containerRef.current) {
      console.log('MessageList scroll triggered:', { 
        messageCount: messages.length, 
        isInitialLoad, 
        isLoadingMore,
        hasRef: !!messagesEndRef.current 
      });
      
      if (isInitialLoad) {
        console.log('Initial load - forcing scroll to bottom');
        isScrollingToBottomRef.current = true;
        
        // Force scroll to bottom immediately for initial load
        const scrollToBottom = () => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        };
        
        // Multiple attempts to ensure scroll happens
        scrollToBottom();
        setTimeout(scrollToBottom, 0);
        setTimeout(scrollToBottom, 10);
        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 200);
        setTimeout(scrollToBottom, 500);
        
        // Reset flag after scrolling
        setTimeout(() => {
          isScrollingToBottomRef.current = false;
        }, 1000);
        
      } else if (isLoadingMore) {
        console.log('Loading more messages - preserving scroll position');
        // Store the current scroll position before new messages are added
        if (containerRef.current) {
          previousScrollHeightRef.current = containerRef.current.scrollHeight;
        }
        
      } else if (!isLoadingMore && previousScrollHeightRef.current > 0) {
        console.log('Restoring scroll position after loading more messages');
        // Calculate the difference in height and adjust scroll position
        if (containerRef.current) {
          const heightDifference = containerRef.current.scrollHeight - previousScrollHeightRef.current;
          containerRef.current.scrollTop = containerRef.current.scrollTop + heightDifference;
          previousScrollHeightRef.current = 0; // Reset
        }
        
      } else {
        // This is a new message, scroll to bottom
        console.log('New message - scrolling to bottom');
        if (!isScrollingToBottomRef.current) {
          const timeoutId = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ 
              behavior: 'smooth',
              block: 'end',
              inline: 'nearest'
            });
          }, 50);
          return () => clearTimeout(timeoutId);
        }
      }
    }
  }, [messages, isInitialLoad, isLoadingMore]);


  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 h-0">
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
    </div>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
