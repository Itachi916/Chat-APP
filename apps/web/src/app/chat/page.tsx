'use client';

import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../lib/firebase';
import { getSocket, disconnectSocket } from '../../lib/socket';
// @ts-ignore
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { User, Conversation, Message, Media, MessageReceipt } from './types';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import VideoUploadProgress from './components/VideoUploadProgress';

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
  const [viewingImage, setViewingImage] = useState<{url: string, fileName: string, mediaId: string} | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [totalLoadedMessages, setTotalLoadedMessages] = useState(0);

  // Cache to prevent duplicate user status events
  const userStatusEventCache = useRef<Set<string>>(new Set());

  // DEBUG: Track component re-renders
  console.log('🔄 ChatPage re-rendered at:', new Date().toISOString());
  console.log('🔄 Current state:', {
    conversationsCount: conversations.length,
    messagesCount: messages.length,
    selectedConversationId: selectedConversation?.id,
    isConnected,
    viewingImage: !!viewingImage
  });

  // DEBUG: Track state changes
  useEffect(() => {
    console.log('📊 Conversations changed:', conversations.length);
  }, [conversations]);

  useEffect(() => {
    console.log('📊 Messages changed:', messages.length);
  }, [messages]);

  useEffect(() => {
    console.log('📊 Selected conversation changed:', selectedConversation?.id);
  }, [selectedConversation]);

  useEffect(() => {
    console.log('📊 Connection status changed:', isConnected);
  }, [isConnected]);

  useEffect(() => {
    console.log('📊 Viewing image changed:', !!viewingImage);
  }, [viewingImage]);
  const [videoUploadProgress, setVideoUploadProgress] = useState<{
    isUploading: boolean;
    progress: number;
    fileName: string;
    fileSize: number;
    thumbnail: string;
    mediaId?: string;
  } | null>(null);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancellingRef = useRef<boolean>(false);
  const messagesRef = useRef<Message[]>([]);

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Handle sign out
  const handleSignOut = useCallback(async () => {
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
  }, [socket, router]);

  // Auto-scroll is now handled in MessageList component

  // Handle ESC key to close image viewer and prevent body scroll
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && viewingImage) {
        setViewingImage(null);
      }
    };

    if (viewingImage) {
      // Prevent body scroll when image viewer is open
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [viewingImage]);

  // Check if user has completed profile setup
  useEffect(() => {
    if (user && !loading) {
      const checkProfile = async () => {
        try {
          const token = await user.getIdToken();
          const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          
          if (!response.ok) {
            // User profile not found, redirect to username setup
            router.push('/username');
            return;
          }
          
          // Profile exists, store current user profile
          const profileData = await response.json();
          setCurrentUserProfile(profileData);
          
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
    console.log('🔌 Socket useEffect running, user:', !!user, 'socket:', !!socket);
    if (user && !socket) {
      const initSocket = async () => {
        console.log('🔌 Creating socket instance via getSocket()');
        const socketInstance = await getSocket();
        console.log('🔌 Socket instance created:', socketInstance);
        
        setSocket(socketInstance);
        
        
        // Check if socket is already connected
        if (socketInstance.connected) {
          socketInstance.emit('join', user.uid);
          setIsConnected(true);
        }
        
        socketInstance.on('connect', () => {
          console.log('🔌 Socket connected');
          setIsConnected(true);
          socketInstance.emit('join', user.uid);
        });

        socketInstance.on('disconnect', () => {
          console.log('🔌 Socket disconnected');
          setIsConnected(false);
        });

        // Listen for new messages
        socketInstance.on('new-message', (message: Message) => {
          // Check for duplicates using ref
          if (messageIdsRef.current.has(message.id)) {
            return; // Skip duplicate message
          }
          messageIdsRef.current.add(message.id);

          const isOwnMessage = message.sender?.firebaseUid === user.uid;
          const isCurrentConversation = selectedConversationRef.current?.id === message.conversationId;

          // Only update conversations if not current conversation or not own message
          if (!isCurrentConversation || !isOwnMessage) {
            console.log('📝 Updating conversations for new message:', message.id);
            setConversations(prev => {
              const updated = prev.map(conv => {
                if (conv.id === message.conversationId) {
                  // Check if the last message actually changed to prevent unnecessary re-renders
                  if (conv.lastMessage?.id === message.id) {
                    console.log('🔄 Last message unchanged, skipping conversation update');
                    return conv; // No change, return same object
                  }
                  
                  console.log('🔄 Last message changed, updating conversation');
                  return {
                    ...conv,
                    lastMessage: message,
                    lastMessageAt: message.createdAt,
                    // Increment unread count only if it's not the current conversation and not our own message
                    unreadCount: isCurrentConversation || isOwnMessage ? conv.unreadCount : conv.unreadCount + 1
                  };
                }
                return conv;
              });
              return updated;
            });
          } else {
            console.log('📝 Skipping conversation update - current conversation or own message');
          }
          
          // Only add message to current messages if it belongs to the currently selected conversation
          if (isCurrentConversation) {
            setMessages(prev => {
              // Double-check for duplicates (safety measure)
              const messageExists = prev.some(m => m.id === message.id);
              if (messageExists) {
                return prev;
              }
              return [...prev, message];
            });
            
            // ULTRA-SIMPLE: Trigger scroll for new message
            console.log('New message received - triggering scroll');
            triggerScrollForNewMessage();
          }
        });

        // Listen for blocked messages
        socketInstance.on('message-blocked', (data: { 
          reason: string; 
          message: string; 
          detectedPattern: string; 
        }) => {
          console.warn('Message blocked:', data);
          
          // Show user-friendly error message
          alert(`Message blocked: ${data.message}`);
          
          // You could also show a toast notification here instead of alert
          // For example: showToast('error', data.message);
        });

        // Listen for conversation updates - OPTIMIZED to prevent unnecessary re-renders
        socketInstance.on('conversation-updated', (data: any) => {
          console.log('🔔 Conversation updated event received:', data);
          setConversations(prev => 
            prev.map(conv => {
              if (conv.id === data.conversationId) {
                // Check if the last message actually changed to prevent unnecessary re-renders
                if (conv.lastMessage?.id === data.lastMessage?.id) {
                  console.log('🔄 No change in last message, skipping re-render');
                  return conv; // No change, return same object to prevent re-render
                }
                
                console.log('🔄 Last message changed, updating conversation');
                return { ...conv, lastMessage: data.lastMessage, lastMessageAt: data.lastMessageAt };
              }
              return conv;
            })
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
          console.log('⌨️ Typing event received:', data);
          
          // Update typing users state
          setTypingUsers(prev => {
            const newTypingUsers = { ...prev };
            
            if (data.isTyping) {
              // Check if typing state actually changed
              if (newTypingUsers[data.conversationId]?.username === data.username) {
                console.log('⌨️ Typing state unchanged, skipping update');
                return prev; // No change, return same object
              }
              
              console.log('⌨️ Adding typing user:', data.username);
              newTypingUsers[data.conversationId] = {
                username: data.username,
                displayName: data.displayName
              };
            } else {
              // Check if user was actually typing
              if (!newTypingUsers[data.conversationId]) {
                console.log('⌨️ User was not typing, skipping update');
                return prev; // No change, return same object
              }
              
              console.log('⌨️ Removing typing user:', data.username);
              delete newTypingUsers[data.conversationId];
            }
            
            return newTypingUsers;
          });

          // Don't update conversation preview when typing - just show typing indicator
          // The conversation preview should remain unchanged to preserve unread count
        });

        // Listen for user status updates - OPTIMIZED to prevent unnecessary re-renders
        if (!socketInstance._userStatusHandlerAttached) {
          console.log('🔌 Attaching user-status-updated handler');
          socketInstance._userStatusHandlerAttached = true;
          
          socketInstance.on('user-status-updated', (data: { 
            userId: string; 
            firebaseUid?: string;
            username?: string;
            displayName?: string;
            status: string; 
            lastSeen: string 
          }) => {
          console.log('🔔 User status updated event received:', data);
          
          // AGGRESSIVE OPTIMIZATION: Check if this is a duplicate event
          const eventKey = `${data.userId}-${data.status}-${data.lastSeen || 'no-lastseen'}`;
          console.log('🔍 Event key:', eventKey);
          console.log('🔍 Cache contents:', Array.from(userStatusEventCache.current));
          
          if (userStatusEventCache.current.has(eventKey)) {
            console.log('🔄 Duplicate user status event, skipping completely');
            return;
          }
          
          console.log('🔄 New user status event, adding to cache');
          userStatusEventCache.current.add(eventKey);
          
          // Clear cache after 5 seconds to allow legitimate status changes
          setTimeout(() => {
            userStatusEventCache.current.delete(eventKey);
            console.log('🔄 Removed event from cache:', eventKey);
          }, 5000);
          
          // Only update if the status actually changed to prevent unnecessary re-renders
          setConversations(prev => 
            prev.map(conv => {
              if (conv.otherUser.id === data.userId) {
                // Check if status actually changed
                if (conv.otherUser.status === data.status) {
                  console.log('🔄 User status unchanged, skipping conversation update');
                  return conv; // No change, return same object to prevent re-render
                }
                
                console.log('🔄 User status changed, updating conversation');
                
                return {
                  ...conv,
                  otherUser: { 
                    ...conv.otherUser, 
                    status: data.status as any, 
                    lastSeen: data.lastSeen,
                    username: data.username || conv.otherUser.username,
                    displayName: data.displayName || conv.otherUser.displayName
                  }
                };
              }
              return conv;
            })
          );

          // Also update selectedConversation if it's the same user
          setSelectedConversation(prev => {
            if (prev && prev.otherUser.id === data.userId) {
              // Check if status actually changed to prevent unnecessary re-renders
              if (prev.otherUser.status === data.status) {
                console.log('🔄 Selected conversation status unchanged, skipping update');
                return prev; // No change, return same object to prevent re-render
              }
              
              console.log('🔄 Selected conversation status changed, updating');
              return {
                ...prev,
                otherUser: {
                  ...prev.otherUser,
                  status: data.status as any,
                  lastSeen: data.lastSeen,
                  username: data.username || prev.otherUser.username,
                  displayName: data.displayName || prev.otherUser.displayName
                }
              };
            }
            return prev;
          });
        });
        } // End of handlersAttached check


        // Load conversations after socket is set up
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
      loadConversations();
    }
  }, [socket, user]);

  // Join conversation rooms when conversations are loaded
  useEffect(() => {
    if (socket && conversations.length > 0) {
      conversations.forEach((conv: Conversation) => {
        socket.emit('join-conversation', conv.id);
      });
    }
  }, [socket, conversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (selectedConversation && socket) {
      selectedConversationRef.current = selectedConversation; // Update ref
      setShouldScrollToBottom(true); // Trigger scroll for new conversation
      setCurrentPage(1); // Reset pagination
      setHasMoreMessages(false); // Reset pagination state
      loadMessages();
      socket.emit('join-conversation', selectedConversation.id);
      
      // Mark messages as read when conversation is selected
      markMessagesAsRead(selectedConversation.id);
    } else {
      selectedConversationRef.current = null; // Clear ref when no conversation selected
    }
  }, [selectedConversation, socket]);

  // ULTRA-SIMPLE: Only scroll when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      console.log('Conversation changed - triggering scroll to bottom');
      setShouldScrollToBottom(true);
    }
  }, [selectedConversation?.id]);

  // ULTRA-SIMPLE: Only scroll when explicitly triggered
  // No automatic detection - only manual triggers

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

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
        socket.emit('heartbeat'); // Send heartbeat to keep connection alive
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

  const loadMessages = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!selectedConversation) return;
    
    if (!append) {
      setIsLoadingMessages(true);
    }
    
    try {
      const token = await user?.getIdToken();
      
      // Calculate the correct page based on how many messages we currently have loaded
      let actualPage = page;
      if (append) {
        // When appending, we need to calculate the page based on current loaded messages
        const messagesPerPage = 50;
        const currentLoadedCount = messagesRef.current.length;
        actualPage = Math.floor(currentLoadedCount / messagesPerPage) + 1;
        console.log(`Current loaded messages: ${currentLoadedCount}, calculating page: ${actualPage}`);
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/messages/conversation/${selectedConversation.id}?page=${actualPage}&limit=50`, {
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
      const rawMessages = data.messages || [];
      const pagination = data.pagination || {};
      
      // Remove duplicates from the server response
      const messages = rawMessages.filter((msg: Message, index: number, arr: Message[]) => 
        arr.findIndex(m => m.id === msg.id) === index
      );
      
      // Update pagination state
      if (append) {
        // When appending, check if we got fewer messages than requested (indicating we've reached the end)
        const hasMore = messages.length === 50;
        setHasMoreMessages(hasMore);
        console.log(`Append: Got ${messages.length} messages, hasMore: ${hasMore}`);
      } else {
        // For initial load, use the server's pagination info
        const hasMore = actualPage < pagination.pages;
        setHasMoreMessages(hasMore);
        console.log(`Initial load: Page ${actualPage}/${pagination.pages}, hasMore: ${hasMore}`);
      }
      
      if (append) {
        // Prepend older messages to the beginning, avoiding duplicates
        setMessages(prev => {
          const existingIds = new Set(prev.map(msg => msg.id));
          const newMessages = messages.filter((msg: Message) => !existingIds.has(msg.id));
          console.log(`Loading ${newMessages.length} new messages out of ${messages.length} total`);
          return [...newMessages, ...prev];
        });
      } else {
        // Replace messages (initial load)
        setMessages(messages);
        // Clear messageIdsRef and populate with loaded messages
        messageIdsRef.current.clear();
        messages.forEach((msg: Message) => {
          messageIdsRef.current.add(msg.id);
        });
      }
      
      // Add new message IDs to the ref (only for new messages)
      if (append) {
        const existingIds = messageIdsRef.current;
        messages.forEach((msg: Message) => {
          if (!existingIds.has(msg.id)) {
            messageIdsRef.current.add(msg.id);
          }
        });
      } else {
        messages.forEach((msg: Message) => {
          messageIdsRef.current.add(msg.id);
        });
      }
      
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!append) {
        setMessages([]); // Only clear messages on initial load error
      }
    } finally {
      if (!append) {
        setIsLoadingMessages(false);
      }
    }
  }, [selectedConversation, user]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMore) return;
    
    setIsLoadingMore(true);
    
    // Don't increment currentPage, let loadMessages calculate the correct page
    await loadMessages(1, true); // page parameter is ignored when append=true
    setIsLoadingMore(false);
  }, [hasMoreMessages, isLoadingMore, loadMessages]);

  const searchUsers = useCallback(async (query: string) => {
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
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to search users:', error);
      setSearchResults([]);
    }
  }, [user]);

  const createDirectConversation = useCallback(async (userId: string) => {
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
  }, [user]);

  // Client-side phone number validation
  const containsPhoneNumber = useCallback((text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    
    // More specific phone number patterns that require proper phone number structure
    const phonePatterns = [
      // US/Canada formats: (123) 456-7890, 123-456-7890, 123.456.7890
      /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      // 10-digit numbers: 1234567890
      /\b\d{10}\b/g,
      // International formats with country code: +1 123 456 7890, +44 20 7946 0958
      /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
      // Emergency numbers: 911, 999, 112, 000
      /\b(911|999|112|000)\b/g,
      // Toll-free numbers: 1-800-XXX-XXXX
      /\b1[-.\s]?800[-.\s]?\d{3}[-.\s]?\d{4}\b/gi,
      // Extension numbers: 123-456-7890 ext 123
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}[-.\s]?(?:ext|extension|x)[-.\s]?\d{1,6}\b/gi,
      // Disguised patterns with spaces: 1 2 3 4 5 6 7 8 9 0 (10+ digits)
      /\b\d(?:\s\d){9,}\b/g
    ];
    
    return phonePatterns.some(pattern => pattern.test(text));
  }, []);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedConversation || !socket) return;

    // Client-side validation for phone numbers
    if (containsPhoneNumber(newMessage)) {
      alert('Phone numbers are not allowed in messages. Please remove any phone numbers and try again.');
      return;
    }

    try {
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
  }, [newMessage, selectedConversation, socket, containsPhoneNumber]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!socket) return;

    try {
      // Send delete message via socket for real-time updates
      socket.emit('delete-message', { messageId });
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }, [socket]);

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

  const handleTyping = useCallback(() => {
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
  }, [selectedConversation, socket]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
    // Reset the input value to allow selecting the same file again
    event.target.value = '';
  }, []);

  // Calculate MD5 hash of file content using Web Crypto API
  const calculateFileHash = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Use Web Crypto API to calculate SHA-256 hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          resolve(hashHex);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const uploadMedia = async (file: File) => {
    if (!selectedConversation) return;

    // Clean up any existing abort controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Create thumbnail for video files - always create fresh URL
    let thumbnail = '';
    if (file.type.startsWith('video/')) {
      try {
        // Revoke any existing URL to prevent memory leaks
        if (videoUploadProgress?.thumbnail) {
          URL.revokeObjectURL(videoUploadProgress.thumbnail);
        }
        thumbnail = URL.createObjectURL(file);
        console.log('Created fresh thumbnail URL:', thumbnail);
      } catch (error) {
        console.error('Failed to create thumbnail URL:', error);
        thumbnail = '';
      }
    }

    // Initialize upload progress
    setVideoUploadProgress({
      isUploading: true,
      progress: 0,
      fileName: file.name,
      fileSize: file.size,
      thumbnail,
    });

    try {
      const token = await user?.getIdToken();
      
      // Step 1: Calculate content hash (10% progress)
      console.log('Calculating file hash...');
      setVideoUploadProgress(prev => prev ? { ...prev, progress: 10 } : null);
      const contentHash = await calculateFileHash(file);
      console.log('File hash:', contentHash);

      // Step 2: Check for duplicates (20% progress)
      console.log('Checking for duplicates...');
      setVideoUploadProgress(prev => prev ? { ...prev, progress: 20 } : null);
      const duplicateCheckResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/check-duplicate/${selectedConversation.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            contentHash,
            fileName: file.name,
            fileType: file.type,
          }),
          signal: abortController.signal,
        }
      ).catch(error => {
        if (error.name === 'AbortError') {
          throw new Error('Upload cancelled');
        }
        throw error;
      });

      if (!duplicateCheckResponse.ok) {
        throw new Error('Failed to check for duplicates');
      }

      const duplicateCheck = await duplicateCheckResponse.json();
      let mediaId: string;

      if (duplicateCheck.isDuplicate && duplicateCheck.existingMedia) {
        // Step 3a: File is duplicate (30% progress)
        console.log('File is duplicate, creating new media record...');
        setVideoUploadProgress(prev => prev ? { ...prev, progress: 30 } : null);
        const duplicateResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/create-duplicate-media/${selectedConversation.id}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              existingMediaId: duplicateCheck.existingMedia.id,
              fileName: file.name,
              fileType: file.type,
            }),
            signal: abortController.signal,
          }
        ).catch(error => {
          if (error.name === 'AbortError') {
            throw new Error('Upload cancelled');
          }
          throw error;
        });

        if (!duplicateResponse.ok) {
          throw new Error('Failed to create duplicate media record');
        }

        const duplicateResult = await duplicateResponse.json();
        mediaId = duplicateResult.id;
        setVideoUploadProgress(prev => prev ? { ...prev, mediaId, progress: 50 } : null);
        console.log('Duplicate file handled:', duplicateResult);
      } else {
        // Step 3b: File is not duplicate, get presigned URL (30% progress)
        console.log('File is unique, getting presigned URL...');
        setVideoUploadProgress(prev => prev ? { ...prev, progress: 30 } : null);
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/upload-url/${selectedConversation.id}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              contentHash,
            }),
            signal: abortController.signal,
          }
        ).catch(error => {
          if (error.name === 'AbortError') {
            throw new Error('Upload cancelled');
          }
          throw error;
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('Upload URL error response:', errorText);
          throw new Error(`Upload URL failed: ${uploadResponse.status} - ${errorText}`);
        }

        const { uploadUrl, mediaId: newMediaId } = await uploadResponse.json();
        mediaId = newMediaId;
        setVideoUploadProgress(prev => prev ? { ...prev, mediaId, progress: 40 } : null);
        console.log('Got presigned URL:', { uploadUrl, mediaId });

        // Step 4: Upload file to S3 with progress tracking (40-80% progress)
        console.log('Uploading file to S3...');
        const xhr = new XMLHttpRequest();
        
        return new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const uploadProgress = (event.loaded / event.total) * 40; // 40% of total progress
              setVideoUploadProgress(prev => prev ? { 
                ...prev, 
                progress: Math.min(40 + uploadProgress, 80) 
              } : null);
            }
          });

          xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
              try {
                // Step 5: Confirm upload and update media record (80-90% progress)
                console.log('Confirming upload...');
                setVideoUploadProgress(prev => prev ? { ...prev, progress: 80 } : null);
                const confirmResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/confirm-upload`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    mediaId,
                    fileSize: file.size,
                  }),
                  signal: abortController.signal,
                });

                if (!confirmResponse.ok) {
                  const errorText = await confirmResponse.text();
                  console.error('Confirm upload error response:', errorText);
                  throw new Error(`Confirm upload failed: ${confirmResponse.status} - ${errorText}`);
                }

                // Step 6: Send message with media (90-100% progress)
                console.log('Creating message with media...');
                setVideoUploadProgress(prev => prev ? { ...prev, progress: 90 } : null);
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
                  signal: abortController.signal,
                });

                if (!messageResponse.ok) {
                  const errorText = await messageResponse.text();
                  console.error('Message creation error response:', errorText);
                  throw new Error(`Message creation failed: ${messageResponse.status} - ${errorText}`);
                }

                setVideoUploadProgress(prev => prev ? { ...prev, progress: 100 } : null);
                setSelectedFile(null);
                setPreviewUrl(null);
                abortControllerRef.current = null;
                console.log('Media upload completed successfully');
                
                // Clear progress after a short delay
                setTimeout(() => {
                  // Clean up thumbnail URL
                  if (videoUploadProgress?.thumbnail) {
                    URL.revokeObjectURL(videoUploadProgress.thumbnail);
                  }
                  setVideoUploadProgress(null);
                }, 1000);
                
                resolve();
              } catch (error) {
                console.error('=== MEDIA UPLOAD FAILED ===', error);
                setVideoUploadProgress(null);
                abortControllerRef.current = null;
                reject(error);
              }
            } else {
              console.error('S3 upload failed:', xhr.status, xhr.statusText);
              setVideoUploadProgress(null);
              abortControllerRef.current = null;
              reject(new Error(`S3 upload failed: ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => {
            console.error('S3 upload failed');
            setVideoUploadProgress(null);
            abortControllerRef.current = null;
            reject(new Error('S3 upload failed'));
          });

          xhr.addEventListener('abort', () => {
            if (isCancellingRef.current) {
              console.log('Upload cancelled by user');
            } else {
              console.log('Upload cancelled');
            }
            setVideoUploadProgress(null);
            abortControllerRef.current = null;
            // Don't reject with error for intentional cancellation
            resolve();
          });

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });
      }
    } catch (error) {
      if (isCancellingRef.current || (error instanceof Error && error.message === 'Upload cancelled')) {
        console.log('Upload was cancelled by user');
      } else {
        console.error('=== MEDIA UPLOAD FAILED ===', error);
      }
      setVideoUploadProgress(null);
      abortControllerRef.current = null;
    }
  };

  const cancelUpload = useCallback(() => {
    // Set cancellation flag
    isCancellingRef.current = true;
    
    // Capture the mediaId and thumbnail before clearing state
    const mediaId = videoUploadProgress?.mediaId;
    const thumbnail = videoUploadProgress?.thumbnail;
    
    // Clean up thumbnail URL if it exists
    if (thumbnail) {
      URL.revokeObjectURL(thumbnail);
    }
    
    // Immediately clean up state to prevent further operations
    setVideoUploadProgress(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    
    // Abort the current upload
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clean up database asynchronously without abort signal
    if (mediaId) {
      (async () => {
        try {
          const token = await user?.getIdToken();
          await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/cancel-upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              mediaId: mediaId,
            }),
          });
        } catch (error) {
          // Silently handle cleanup errors
          console.log('Cleanup completed (some operations may have failed)');
        } finally {
          // Reset cancellation flag
          isCancellingRef.current = false;
        }
      })();
    } else {
      // Reset cancellation flag if no mediaId
      isCancellingRef.current = false;
    }
  }, [videoUploadProgress?.mediaId, user]);

  const formatTime = useCallback((timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const handleMessageChange = useCallback((value: string) => {
    setNewMessage(value);
  }, []);

  const handleImageClick = useCallback((url: string, fileName: string, mediaId: string) => {
    setViewingImage({url, fileName, mediaId});
  }, []);

  // SIMPLE: Handle scroll completion
  const handleScrollComplete = useCallback(() => {
    console.log('Scroll to bottom completed');
    setShouldScrollToBottom(false);
  }, []);

  // ULTRA-SIMPLE: Manual trigger for new message scroll
  const triggerScrollForNewMessage = useCallback(() => {
    console.log('Manual trigger for new message scroll');
    setShouldScrollToBottom(true);
  }, []);

  const downloadImage = useCallback(async (mediaId: string, fileName: string) => {
    setIsDownloading(true);
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      // Use the server download endpoint to avoid CORS issues
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/download/${mediaId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Create a blob URL for download
      const blobUrl = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      
      console.log('Image downloaded successfully');
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [user]);


  // Function to get presigned URL for media viewing
  const getMediaViewUrl = useCallback(async (mediaId: string): Promise<string | null> => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/media/view-url/${mediaId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.viewUrl;
      } else {
        console.error('Failed to get media view URL:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Error getting media view URL:', error);
      return null;
    }
  }, [user]);

  // Media components are now in MessageItem.tsx for better performance

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
            currentUser={currentUserProfile}
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
            {isLoadingMessages ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading messages...</p>
                </div>
              </div>
            ) : (
              <MessageList
                messages={messages}
                currentUserId={user.uid}
                onDeleteMessage={deleteMessage}
                formatTime={formatTime}
                getMediaViewUrl={getMediaViewUrl}
                onImageClick={handleImageClick}
                hasMoreMessages={hasMoreMessages}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMoreMessages}
                shouldScrollToBottom={shouldScrollToBottom}
                onScrollComplete={handleScrollComplete}
                onScrollToBottom={triggerScrollForNewMessage}
              />
            )}
            
            {/* Typing Indicator */}
            {selectedConversation && typingUsers[selectedConversation.id] && (
              <div className="px-4 py-2">
                <div className="text-sm text-blue-600 italic animate-pulse">
                  typing...
                </div>
              </div>
            )}

            {/* Image Viewer Modal */}
            {viewingImage && (
              <div 
                className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4"
                onClick={() => setViewingImage(null)}
              >
                <div 
                  className="relative max-w-4xl max-h-full w-full h-full flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header with close button and download */}
                  <div className="flex justify-between items-center p-4 bg-black bg-opacity-50 text-white">
                    <h3 className="text-lg font-medium truncate">{viewingImage.fileName}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => downloadImage(viewingImage.mediaId, viewingImage.fileName)}
                        disabled={isDownloading}
                        className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                        title={isDownloading ? "Downloading..." : "Download image"}
                      >
                        {isDownloading ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => setViewingImage(null)}
                        className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Close"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Image container */}
                  <div className="flex-1 flex items-center justify-center p-4">
                    <img
                      src={viewingImage.url}
                      alt={viewingImage.fileName}
                      className="max-w-full max-h-full object-contain rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* File Preview */}
            {previewUrl && selectedFile && !videoUploadProgress && (
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

            {/* Video Upload Progress */}
            {videoUploadProgress && (
              <VideoUploadProgress
                isUploading={videoUploadProgress.isUploading}
                progress={videoUploadProgress.progress}
                fileName={videoUploadProgress.fileName}
                fileSize={videoUploadProgress.fileSize}
                thumbnail={videoUploadProgress.thumbnail}
                onCancel={cancelUpload}
              />
            )}

            {/* Message Input */}
            <MessageInput
              newMessage={newMessage}
              onMessageChange={handleMessageChange}
              onSendMessage={sendMessage}
              onFileSelect={handleFileSelect}
              onTyping={handleTyping}
              containsPhoneNumber={containsPhoneNumber}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Welcome to Chat App</h2>
              <p className="text-gray-600">Select a conversation to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
