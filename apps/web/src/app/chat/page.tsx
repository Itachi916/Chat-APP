'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../lib/firebase';
import { getSocket, disconnectSocket } from '../../lib/socket';
// @ts-ignore
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { User, Conversation, Message, Media, MessageReceipt } from './types';
import ChatPreloader from './components/ChatPreloader';

// Dynamic imports for better code splitting
const ChatSidebar = dynamic(() => import('./components/ChatSidebar'), {
  loading: () => <div className="w-80 bg-white shadow-lg flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});

const MediaPreview = dynamic(() => import('../MediaPreview'), {
  loading: () => <div>Loading media preview...</div>
});


export default function ChatPage() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{[conversationId: string]: {username: string, displayName: string}}>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Handle sign out
  const handleSignOut = async () => {
    try {
      // Disconnect socket before signing out
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      disconnectSocket(); // Clean up global socket instance
      await signOut(auth);
      router.push('/auth');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check if user has completed profile setup
  useEffect(() => {
    if (user && !loading) {
      const checkProfile = async () => {
        try {
          console.log('Chat page: Checking profile for user:', user.uid);
          const token = await user.getIdToken();
          const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          console.log('Chat page: Profile response status:', response.status);
          
          if (!response.ok) {
            // User profile not found, redirect to username setup
            console.log('Chat page: No profile found, redirecting to username');
            router.push('/username');
            return;
          }
          
          // Profile exists, load conversations
          console.log('Chat page: Profile found, loading conversations');
          // Note: Conversations will be loaded when socket initializes
        } catch (error) {
          console.error('Profile check error:', error);
          router.push('/username');
        }
      };
      
      // Add a small delay to allow profile creation to complete
      const timer = setTimeout(() => {
        checkProfile();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  // Initialize socket connection and set up listeners
  useEffect(() => {
    if (user && !socket) {
      const initSocket = async () => {
        const socketInstance = await getSocket();
        console.log('Socket instance created:', socketInstance);
        console.log('Socket connected:', socketInstance.connected);
        
        setSocket(socketInstance);
        
        console.log('Setting up socket listeners for user:', user.uid);
        
        // Check if socket is already connected
        if (socketInstance.connected) {
          console.log('Socket already connected, joining user room');
          socketInstance.emit('join', user.uid);
          setIsConnected(true);
        }
        
        socketInstance.on('connect', () => {
          console.log('Connected to server');
          setIsConnected(true);
          socketInstance.emit('join', user.uid);
        });

        socketInstance.on('disconnect', () => {
          console.log('Disconnected from server');
          setIsConnected(false);
        });

        // Listen for new messages
        socketInstance.on('new-message', (message: Message) => {
          console.log('=== NEW MESSAGE RECEIVED ===');
          console.log('Message:', message);
          console.log('Current selected conversation (ref):', selectedConversationRef.current?.id);
          console.log('Message conversation ID:', message.conversationId);
          console.log('Current conversations count:', conversations.length);
          
          // Update conversation list with new message and increment unread count
          setConversations(prev => {
            console.log('Updating conversations, current count:', prev.length);
            const updated = prev.map(conv => {
              if (conv.id === message.conversationId) {
                const isCurrentConversation = selectedConversationRef.current?.id === message.conversationId;
                const isOwnMessage = message.sender?.firebaseUid === user.uid;
                
                console.log('Found matching conversation:', conv.id);
                console.log('Is current conversation:', isCurrentConversation);
                console.log('Is own message:', isOwnMessage);
                console.log('Previous unread count:', conv.unreadCount);
                
                const updatedConv = {
                  ...conv,
                  lastMessage: message,
                  lastMessageAt: message.createdAt,
                  // Increment unread count only if it's not the current conversation and not our own message
                  unreadCount: isCurrentConversation || isOwnMessage ? conv.unreadCount : conv.unreadCount + 1
                };
                
                console.log('New unread count:', updatedConv.unreadCount);
                return updatedConv;
              }
              return conv;
            });
            console.log('Updated conversations count:', updated.length);
            return updated;
          });
          
          // Only add message to current messages if it belongs to the currently selected conversation
          setMessages(prev => {
            // Check if we're currently viewing this conversation using ref
            if (selectedConversationRef.current && message.conversationId === selectedConversationRef.current.id) {
              console.log('Adding message to current conversation');
              return [...prev, message];
            } else {
              console.log('Message not for current conversation, ignoring');
              return prev;
            }
          });
        });

        // Listen for conversation updates
        socketInstance.on('conversation-updated', (data: any) => {
          setConversations(prev => 
            prev.map(conv => 
              conv.id === data.conversationId 
                ? { ...conv, lastMessage: data.lastMessage, lastMessageAt: data.lastMessageAt }
                : conv
            )
          );
        });

        // Listen for new conversations
        socketInstance.on('conversation-created', (conversation: Conversation) => {
          setConversations(prev => {
            // Check if conversation already exists to prevent duplicates
            const exists = prev.some(conv => conv.id === conversation.id);
            if (exists) {
              return prev;
            }
            return [conversation, ...prev];
          });
          
          // Join the new conversation room for real-time updates
          socketInstance.emit('join-conversation', conversation.id);
        });

        // Listen for message deletions
        socketInstance.on('message-deleted', (data: { 
          messageId: string; 
          permanentlyDeleted: boolean;
          deletedByUser1?: boolean;
          deletedByUser2?: boolean;
        }) => {
          if (data.permanentlyDeleted) {
            // Remove message from the list
            setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
          } else {
            // Soft delete - just filter out the message
            setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
          }
        });

        // Listen for conversation list updates (when messages are deleted)
        socketInstance.on('conversation-list-updated', (data: { 
          conversationId: string; 
          messageDeleted: boolean;
        }) => {
          if (data.messageDeleted) {
            // Reload conversations to update the last message preview
            // Note: This will be handled by the socket initialization
            console.log('Conversation list updated, but reloading is handled by socket init');
          }
        });

        // Listen for typing indicators
        socketInstance.on('typing', (data: { 
          userId: string; 
          username: string; 
          displayName: string; 
          isTyping: boolean; 
          conversationId: string 
        }) => {
          console.log('Typing indicator received:', data);
          
          // Update typing users state
          setTypingUsers(prev => {
            const newTypingUsers = { ...prev };
            
            if (data.isTyping) {
              newTypingUsers[data.conversationId] = {
                username: data.username,
                displayName: data.displayName
              };
            } else {
              delete newTypingUsers[data.conversationId];
            }
            
            return newTypingUsers;
          });

          // Don't update conversation preview when typing - just show typing indicator
          // The conversation preview should remain unchanged to preserve unread count
        });

        // Listen for user status updates
        socketInstance.on('user-status-updated', (data: { userId: string; status: string; lastSeen: string }) => {
          setConversations(prev => 
            prev.map(conv => ({
              ...conv,
              otherUser: conv.otherUser.id === data.userId 
                ? { ...conv.otherUser, status: data.status as any, lastSeen: data.lastSeen }
                : conv.otherUser
            }))
          );
        });


        // Load conversations after socket is set up
        console.log('Loading conversations for user:', user.uid);
        loadConversations();
      };

      initSocket();

      return () => {
        if (socket) {
          socket.off('connect');
          socket.off('disconnect');
          socket.off('new-message');
          socket.off('user-status-updated');
          socket.off('conversation-updated');
          socket.off('conversation-created');
          socket.off('message-deleted');
          socket.off('conversation-list-updated');
          socket.off('typing');
          socket.off('typing-stopped');
          socket.disconnect();
        }
      };
    }
  }, [user]);

  // Load conversations and join rooms when socket is available
  useEffect(() => {
    if (socket && user) {
      console.log('Socket available, loading conversations and joining rooms');
      loadConversations();
    }
  }, [socket, user]);

  // Join conversation rooms when conversations are loaded
  useEffect(() => {
    if (socket && conversations.length > 0) {
      console.log('Joining all conversation rooms for real-time updates...');
      conversations.forEach((conv: Conversation) => {
        console.log('Joining conversation room:', conv.id);
        socket.emit('join-conversation', conv.id);
      });
    }
  }, [socket, conversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (selectedConversation && socket) {
      console.log('Joining conversation:', selectedConversation.id);
      selectedConversationRef.current = selectedConversation; // Update ref
      loadMessages();
      socket.emit('join-conversation', selectedConversation.id);
      
      // Mark messages as read when conversation is selected
      markMessagesAsRead(selectedConversation.id);
    } else {
      selectedConversationRef.current = null; // Clear ref when no conversation selected
    }
  }, [selectedConversation, socket]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle visibility change and focus (when user returns to chat)
  useEffect(() => {
    const handlePresence = () => {
      if (socket && user) {
        // User returned to the chat window, emit presence
        socket.emit('join', user.uid);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handlePresence();
      }
    };

    const handleFocus = () => {
      handlePresence();
    };

    // Periodic heartbeat to maintain online status (every 30 seconds)
    const heartbeatInterval = setInterval(() => {
      if (socket && user && !document.hidden) {
        socket.emit('join', user.uid);
      }
    }, 30000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [socket, user]);

  const loadConversations = async () => {
    try {
      console.log('=== LOADING CONVERSATIONS ===');
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // User profile not found, redirect to username setup
          router.push('/username');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Loaded conversations:', data.length);
      // Ensure data is an array before setting it
      if (Array.isArray(data)) {
        setConversations(data);
      } else {
        console.error('Invalid conversations data:', data);
        setConversations([]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setConversations([]); // Ensure conversations is always an array
    }
  };

  const loadMessages = async () => {
    if (!selectedConversation) return;
    
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/messages/conversation/${selectedConversation.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Messages API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Messages Non-JSON response:', responseText);
        throw new Error('Server returned non-JSON response');
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]); // Ensure messages is always an array
    }
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/conversations/search/users?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Search API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Search Non-JSON response:', responseText);
        throw new Error('Server returned non-JSON response');
      }
      
      const data = await response.json();
      console.log('Search results:', data);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to search users:', error);
      setSearchResults([]);
    }
  };

  const createDirectConversation = async (userId: string) => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/conversations/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ otherUserId: userId }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Non-JSON response:', responseText);
        throw new Error('Server returned non-JSON response');
      }
      
      const conversation = await response.json();
      console.log('Created conversation:', conversation);
      setConversations(prev => {
        // Check if conversation already exists to prevent duplicates
        const exists = prev.some(conv => conv.id === conversation.id);
        if (exists) {
          return prev;
        }
        return [conversation, ...prev];
      });
      setSelectedConversation(conversation);
      setShowSearch(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !socket) return;

    try {
      console.log('Sending message via socket:', {
        conversationId: selectedConversation.id,
        content: newMessage,
        messageType: 'TEXT',
      });
      
      // Send message via socket for real-time updates
      socket.emit('send-message', {
        conversationId: selectedConversation.id,
        content: newMessage,
        messageType: 'TEXT',
      });
      
      setNewMessage('');
      // Stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.emit('typing', { conversationId: selectedConversation.id, isTyping: false });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!socket) return;

    try {
      // Send delete message via socket for real-time updates
      socket.emit('delete-message', { messageId });
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const markMessagesAsRead = async (conversationId: string) => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Update conversation unread count to 0
        setConversations(prev => 
          prev.map(conv => 
            conv.id === conversationId 
              ? { ...conv, unreadCount: 0 }
              : conv
          )
        );
      }
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const handleTyping = () => {
    if (!selectedConversation || !socket) return;

    // Emit typing indicator
    socket.emit('typing', { conversationId: selectedConversation.id, isTyping: true });
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: selectedConversation.id, isTyping: false });
    }, 1000);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const uploadMedia = async (file: File) => {
    if (!selectedConversation) return;

    try {
      const token = await user?.getIdToken();
      
      // Get upload URL
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          conversationId: selectedConversation.id,
        }),
      });
      
      const { uploadUrl, mediaId } = await uploadResponse.json();
      
      // Upload file to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      
      // Confirm upload
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/confirm-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaId,
          fileSize: file.size,
        }),
      });
      
      // Send message with media
      const messageResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          messageType: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
          mediaIds: [mediaId],
        }),
      });
      
      if (messageResponse.ok) {
        setSelectedFile(null);
        setPreviewUrl(null);
      }
    } catch (error) {
      console.error('Failed to upload media:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Authentication Error</h1>
          <p className="text-gray-600 mb-4">{error?.message || String(error)}</p>
          <button
            onClick={handleSignOut}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Please sign in to use the chat</h1>
          <p className="text-gray-600">Redirecting to home page...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatPreloader />
      <div className="h-screen bg-gray-100 flex overflow-hidden">
        {/* Sidebar */}
        <Suspense fallback={<div className="w-80 bg-white shadow-lg flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
          <ChatSidebar
            conversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={setSelectedConversation}
            onSearchUsers={searchUsers}
            searchResults={searchResults}
            showSearch={showSearch}
            setShowSearch={setShowSearch}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onCreateConversation={createDirectConversation}
            isConnected={isConnected}
            onSignOut={handleSignOut}
            typingUsers={typingUsers}
          />
        </Suspense>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white shadow-sm border-b p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  {selectedConversation.otherUser.avatar ? (
                    <img src={selectedConversation.otherUser.avatar} alt={selectedConversation.otherUser.displayName} className="w-10 h-10 rounded-full" />
                  ) : (
                    <span className="text-gray-600 font-semibold">
                      {selectedConversation.otherUser.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800">
                    {selectedConversation.otherUser.username}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selectedConversation.otherUser.status === 'ONLINE' ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 h-0">
              {Array.isArray(messages) && messages.map((message) => {
                const isOwnMessage = message.sender?.firebaseUid === user.uid;
                console.log('Message alignment check:', { 
                  messageSenderFirebaseUid: message.sender?.firebaseUid, 
                  userUid: user.uid, 
                  isOwnMessage 
                });
                return (
                <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative ${
                    isOwnMessage 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-800'
                  }`}>
                    {message.messageType === 'TEXT' && (
                      <div>{message.content}</div>
                    )}
                    {message.messageType === 'IMAGE' && message.media[0] && (
                      <img src={message.media[0].s3Url} alt="Shared image" className="max-w-full h-auto rounded" />
                    )}
                    {message.messageType === 'VIDEO' && message.media[0] && (
                      <video src={message.media[0].s3Url} controls className="max-w-full h-auto rounded" />
                    )}
                    <div className="flex justify-between items-center mt-1">
                      <div className="text-xs opacity-75">
                        {formatTime(message.createdAt)}
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this message?')) {
                            deleteMessage(message.id);
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
              })}
              {selectedConversation && typingUsers[selectedConversation.id] && (
                <div className="text-sm text-blue-600 italic animate-pulse">
                  typing...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File Preview */}
            {previewUrl && selectedFile && (
              <div className="p-4 border-t bg-gray-50">
                <div className="flex items-center space-x-4">
                  {selectedFile.type.startsWith('image/') ? (
                    <img src={previewUrl} alt="Preview" className="w-20 h-20 object-cover rounded" />
                  ) : selectedFile.type.startsWith('video/') ? (
                    <video src={previewUrl} className="w-20 h-20 object-cover rounded" controls />
                  ) : null}
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => uploadMedia(selectedFile)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex space-x-2">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
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
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Welcome to Chat App</h2>
              <p className="text-gray-600 mb-6">Select a conversation or start a new chat</p>
              <button
                onClick={() => setShowSearch(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                Start New Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
