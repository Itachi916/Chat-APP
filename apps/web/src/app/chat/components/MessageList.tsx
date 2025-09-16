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
}

const MessageList = memo(({ messages, currentUserId, onDeleteMessage, formatTime, getMediaViewUrl, onImageClick }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 h-0">
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
