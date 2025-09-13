-- Add performance indexes for optimal conversation loading

-- 1. Composite index for conversation lookup by users
-- This optimizes the OR query: WHERE (user1Id = ? OR user2Id = ?)
CREATE INDEX IF NOT EXISTS "idx_conversations_users" ON "conversations"("user1Id", "user2Id");

-- 2. Index for message ordering by conversation and creation time
-- This optimizes: ORDER BY createdAt DESC for messages in a conversation
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created" ON "messages"("conversationId", "createdAt" DESC);

-- 3. Index for unread count queries
-- This optimizes queries that filter by conversation, sender, and creation time
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_sender_created" ON "messages"("conversationId", "senderId", "createdAt" DESC);

-- 4. Index for soft delete filtering
-- This optimizes queries that filter by deletedByUser1 and deletedByUser2
CREATE INDEX IF NOT EXISTS "idx_messages_deleted_flags" ON "messages"("deletedByUser1", "deletedByUser2");

-- 5. Index for read state lookups
-- This optimizes: WHERE conversationId = ? AND userId = ?
CREATE INDEX IF NOT EXISTS "idx_conversation_read_states" ON "conversation_read_states"("conversationId", "userId");

-- 6. Index for lastMessageAt ordering
-- This optimizes: ORDER BY lastMessageAt DESC
CREATE INDEX IF NOT EXISTS "idx_conversations_last_message_at" ON "conversations"("lastMessageAt" DESC);

-- 7. Index for message receipts lookup
-- This optimizes: WHERE messageId = ? AND userId = ?
CREATE INDEX IF NOT EXISTS "idx_message_receipts_lookup" ON "message_receipts"("messageId", "userId");

-- 8. Index for user search optimization
-- This optimizes username and displayName searches
CREATE INDEX IF NOT EXISTS "idx_users_username_search" ON "users"("username");
CREATE INDEX IF NOT EXISTS "idx_users_display_name_search" ON "users"("displayName");

-- 9. Index for media lookup by conversation
-- This optimizes media queries for conversations
CREATE INDEX IF NOT EXISTS "idx_media_conversation" ON "media"("conversationId");

-- 10. Index for user status updates
-- This optimizes user lookups by Firebase UID
CREATE INDEX IF NOT EXISTS "idx_users_firebase_uid" ON "users"("firebaseUid");
