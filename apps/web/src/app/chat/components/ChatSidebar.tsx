'use client';

import { useState } from 'react';
import { User, Conversation } from '../types';

interface ChatSidebarProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onSearchUsers: (query: string) => void;
  searchResults: User[];
  showSearch: boolean;
  setShowSearch: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onCreateConversation: (userId: string) => void;
  isConnected: boolean;
  onSignOut: () => void;
  typingUsers: {[conversationId: string]: {username: string, displayName: string}};
}

export default function ChatSidebar({
  conversations,
  selectedConversation,
  onSelectConversation,
  onSearchUsers,
  searchResults,
  showSearch,
  setShowSearch,
  searchQuery,
  setSearchQuery,
  onCreateConversation,
  isConnected,
  onSignOut,
  typingUsers
}: ChatSidebarProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-80 bg-white shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Chats</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-sm text-gray-600">{isConnected ? 'Online' : 'Offline'}</span>
            </div>
            <button
              onClick={onSignOut}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Sign Out
            </button>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearchUsers(e.target.value);
                setShowSearch(!!(e.target.value && e.target.value.length > 0));
              }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {showSearch && (
        <div className="border-b max-h-60 overflow-y-auto">
          {Array.isArray(searchResults) && searchResults.map((user) => (
            <div
              key={user.id}
              onClick={() => onCreateConversation(user.id)}
              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.displayName} className="w-10 h-10 rounded-full" />
                  ) : (
                    <span className="text-gray-600 font-semibold">
                      {user.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{user.username}</p>
                  <p className="text-sm text-gray-600">{user.displayName}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${
                  user.status === 'ONLINE' ? 'bg-green-400' : 'bg-gray-400'
                }`}></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {Array.isArray(conversations) && conversations.map((conversation) => (
          <div
            key={conversation.id}
            onClick={() => onSelectConversation(conversation)}
            className={`p-4 border-b hover:bg-gray-50 cursor-pointer relative ${
              selectedConversation?.id === conversation.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
            } ${conversation.unreadCount > 0 ? 'bg-green-50' : ''}`}
          >
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center relative">
                {conversation.otherUser.avatar ? (
                  <img src={conversation.otherUser.avatar} alt={conversation.otherUser.displayName} className="w-12 h-12 rounded-full" />
                ) : (
                  <span className="text-gray-600 font-semibold text-lg">
                    {conversation.otherUser.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                {/* Online status indicator */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                  conversation.otherUser.status === 'ONLINE' ? 'bg-green-400' : 'bg-gray-400'
                }`}></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`font-semibold truncate ${
                    conversation.unreadCount > 0 ? 'text-gray-900 font-bold' : 'text-gray-800'
                  }`}>
                    {conversation.otherUser.username}
                  </p>
                  <div className="flex items-center space-x-2">
                    {conversation.unreadCount > 0 && (
                      <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                        {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                      </span>
                    )}
                    {conversation.lastMessageAt && (
                      <span className={`text-xs ${
                        conversation.unreadCount > 0 ? 'text-green-600 font-semibold' : 'text-gray-500'
                      }`}>
                        {formatTime(conversation.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </div>
                <p className={`text-sm truncate ${
                  conversation.unreadCount > 0 ? 'text-gray-800 font-medium' : 'text-gray-600'
                }`}>
                  {typingUsers[conversation.id] ? (
                    <span className="text-blue-600 italic">
                      typing...
                    </span>
                  ) : conversation.lastMessage ? (
                    conversation.lastMessage.messageType === 'TEXT' 
                      ? conversation.lastMessage.content
                      : `📎 ${conversation.lastMessage.messageType.toLowerCase()}`
                  ) : 'No messages yet'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
