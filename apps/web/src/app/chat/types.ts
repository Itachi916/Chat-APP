export interface User {
  id: string;
  firebaseUid: string;
  username: string;
  displayName: string;
  avatar?: string;
  status: 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY';
  lastSeen: string;
}

export interface Conversation {
  id: string;
  otherUser: User;
  lastMessage?: Message;
  lastMessageAt?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId?: string;
  content?: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'LOCATION' | 'CONTACT' | 'STICKER';
  replyToId?: string;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
  sender: User;
  recipient?: User;
  media: Media[];
  receipts: MessageReceipt[];
  replyTo?: Message;
}

export interface Media {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MessageReceipt {
  status: 'SENT' | 'DELIVERED' | 'READ';
  timestamp: string;
}
