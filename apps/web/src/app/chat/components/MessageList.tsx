import React, { memo, useRef, useEffect } from 'react';
import { Message } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  onDeleteMessage: (messageId: string) => void;
  formatTime: (timestamp: string) => string;
  getMediaViewUrl: (mediaId: string) => Promise<string | null>;
  onImageClick: (url: string, fileName: string) => void;
  isInitialLoad?: boolean;
}

const MessageList = memo(({ messages, currentUserId, onDeleteMessage, formatTime, getMediaViewUrl, onImageClick, isInitialLoad = false }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      console.log('MessageList scroll triggered:', { 
        messageCount: messages.length, 
        isInitialLoad, 
        hasRef: !!messagesEndRef.current 
      });
      
      if (isInitialLoad) {
        console.log('Scrolling to bottom immediately (initial load)');
        // Immediate scroll to bottom for initial load - no animation
        messagesEndRef.current.scrollIntoView({ 
          behavior: 'auto', 
          block: 'end',
          inline: 'nearest'
        });
        
        // Force scroll the container to bottom as well
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      } else {
        // Smooth scroll for new messages
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
  }, [messages, isInitialLoad]);

  // Additional effect to ensure scroll happens on initial load
  useEffect(() => {
    if (isInitialLoad && messages.length > 0 && containerRef.current) {
      console.log('Force scrolling to bottom for initial load');
      // Force scroll to bottom multiple times to ensure it works
      const scrollToBottom = () => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
      };
      
      // Immediate scroll
      scrollToBottom();
      
      // Additional scrolls with small delays
      setTimeout(scrollToBottom, 0);
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 200);
    }
  }, [isInitialLoad, messages.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 h-0">
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
