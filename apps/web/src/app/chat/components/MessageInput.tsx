import React, { memo, useCallback } from 'react';

interface MessageInputProps {
  newMessage: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTyping: () => void;
  containsPhoneNumber?: (text: string) => boolean;
}

const MessageInput = memo(({ 
  newMessage, 
  onMessageChange, 
  onSendMessage, 
  onFileSelect, 
  onTyping,
  containsPhoneNumber
}: MessageInputProps) => {
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSendMessage();
    }
  }, [onSendMessage]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onMessageChange(e.target.value);
    onTyping();
  }, [onMessageChange, onTyping]);

  const hasPhoneNumber = containsPhoneNumber && containsPhoneNumber(newMessage);

  return (
    <div className="p-4 border-t bg-white">
      {/* Phone number warning */}
      {hasPhoneNumber && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-red-500">⚠️</span>
            <span className="text-sm text-red-700">
              Phone numbers are not allowed in messages
            </span>
          </div>
        </div>
      )}
      
      <div className="flex space-x-2">
        <input
          type="file"
          accept="image/*,video/*"
          onChange={onFileSelect}
          className="hidden"
          id="file-input"
        />
        <label
          htmlFor="file-input"
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg cursor-pointer transition-colors"
        >
          📎
        </label>
        <input
          type="text"
          value={newMessage}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className={`flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 ${
            hasPhoneNumber 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
        />
        <button
          onClick={onSendMessage}
          disabled={!newMessage.trim() || hasPhoneNumber}
          className={`px-6 py-2 rounded-lg transition-colors ${
            hasPhoneNumber
              ? 'bg-red-400 text-white cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white'
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
