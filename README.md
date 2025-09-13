# 💬 Real-time Chat Application

A full-stack real-time chat application built with Next.js, Express.js, PostgreSQL, Prisma, Firebase Auth, Socket.IO, and AWS S3.

## 🚀 Features

### Core Chat Features
- **Real-time messaging** with Socket.IO
- **Direct messages** between users
- **Group chats** with multiple participants
- **Message types**: Text, Images, Videos, Audio, Files, Location, Contact, Sticker
- **Message receipts**: Sent, Delivered, Read status
- **Typing indicators** in real-time
- **Message replies** and editing
- **User status**: Online, Offline, Away, Busy

### Media & File Sharing
- **S3 integration** for file storage
- **Image and video previews**
- **Thumbnail generation** for videos
- **File metadata** tracking (size, dimensions, duration)
- **Presigned URLs** for secure uploads

### User Management
- **Firebase Authentication** integration
- **User profiles** with avatars and status
- **User search** functionality
- **Real-time status updates**

### Database Features
- **PostgreSQL** with Prisma ORM
- **Comprehensive schema** for users, conversations, messages, media
- **Message receipts** tracking
- **Conversation participants** management
- **Media metadata** storage

## 🏗️ Architecture

### Backend (Express.js + TypeScript)
```
apps/server/
├── src/
│   ├── lib/
│   │   └── prisma.ts          # Prisma client configuration
│   ├── middleware/
│   │   └── auth.ts            # Firebase auth middleware
│   ├── routes/
│   │   ├── users.ts           # User management API
│   │   ├── conversations.ts   # Conversation management API
│   │   ├── messages.ts        # Message handling API
│   │   ├── media.ts           # Media upload/management API
│   │   └── health.ts          # Health check endpoint
│   ├── socket.ts              # Socket.IO event handlers
│   ├── firebaseAdmin.ts       # Firebase Admin SDK
│   ├── s3.ts                  # AWS S3 integration
│   └── index.ts               # Main server file
├── prisma/
│   └── schema.prisma          # Database schema
└── .env                       # Environment variables
```

### Frontend (Next.js + TypeScript)
```
apps/web/
├── src/
│   ├── app/
│   │   ├── chat/
│   │   │   └── page.tsx       # Main chat interface
│   │   ├── page.tsx           # Landing page
│   │   └── MediaPreview.tsx   # Media preview component
│   ├── lib/
│   │   ├── firebase.ts        # Firebase client config
│   │   └── socket.ts          # Socket.IO client
│   └── types/
│       └── firebase-auth.d.ts # TypeScript declarations
```

## 🛠️ Tech Stack

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** database
- **Prisma** ORM
- **Socket.IO** for real-time communication
- **Firebase Admin SDK** for authentication
- **AWS S3** for file storage
- **Multer** for file uploads

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Firebase Auth** for authentication
- **Socket.IO Client** for real-time communication
- **React Hooks** for state management

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Firebase project
- AWS S3 bucket

### 1. Clone the repository
```bash
git clone <repository-url>
cd chat-app
```

### 2. Install dependencies
```bash
# Install root dependencies
npm install

# Install server dependencies
cd apps/server
npm install

# Install web dependencies
cd ../web
npm install
```

### 3. Environment Setup

#### Server Environment (`apps/server/.env`)
```env
# PostgreSQL Database
DATABASE_URL=postgresql://username:password@localhost:5432/chat_app?schema=public

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="your_private_key"

# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name

# Server Configuration
PORT=4000
WEB_ORIGIN=http://localhost:3000
```

#### Web Environment (`apps/web/.env.local`)
```env
# Firebase Client Config
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Server URL
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

### 4. Database Setup
```bash
cd apps/server

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) Seed the database
npx prisma db seed
```

### 5. Start the application
```bash
# Start the server (from apps/server)
npm run dev

# Start the web app (from apps/web)
npm run dev
```

## 🚀 Usage

### 1. Authentication
- Users are automatically signed in anonymously
- Firebase handles authentication
- User profiles are created on first login

### 2. Starting a Chat
- Click the "+" button to search for users
- Type a username or display name to search
- Click on a user to start a direct conversation

### 3. Sending Messages
- Type in the message input and press Enter
- Use the 📎 button to attach files (images/videos)
- Messages are delivered in real-time

### 4. Group Chats
- Create group conversations (feature coming soon)
- Add multiple participants
- Set group names and descriptions

## 📡 API Endpoints

### Users
- `GET /api/users/me` - Get current user profile
- `POST /api/users/profile` - Create/update user profile
- `PATCH /api/users/status` - Update user status
- `GET /api/users/search` - Search users
- `GET /api/users/:userId` - Get user by ID

### Conversations
- `GET /api/conversations` - Get user's conversations
- `POST /api/conversations/direct` - Create direct conversation
- `POST /api/conversations/group` - Create group conversation
- `GET /api/conversations/:id` - Get conversation by ID

### Messages
- `GET /api/messages/:conversationId` - Get conversation messages
- `POST /api/messages` - Send a message
- `PATCH /api/messages/:id` - Edit a message
- `DELETE /api/messages/:id` - Delete a message
- `PATCH /api/messages/:id/receipt` - Update message receipt

### Media
- `POST /api/media/upload-url` - Get presigned upload URL
- `POST /api/media/confirm-upload` - Confirm file upload
- `GET /api/media/:id` - Get media by ID
- `DELETE /api/media/:id` - Delete media

## 🔌 Socket.IO Events

### Client to Server
- `join` - Join user to their personal room
- `join-conversation` - Join a conversation room
- `leave-conversation` - Leave a conversation room
- `typing` - Send typing indicator
- `send-message` - Send a message
- `update-receipt` - Update message receipt status
- `update-status` - Update user status

### Server to Client
- `new-message` - New message received
- `conversation-updated` - Conversation updated
- `typing` - User typing indicator
- `user-status-updated` - User status changed
- `receipt-updated` - Message receipt updated

## 🗄️ Database Schema

### Users
- User profiles and authentication
- Status tracking (online/offline/away/busy)
- Avatar and display information

### Conversations
- Direct and group conversations
- Participant management
- Last message tracking

### Messages
- Text and media messages
- Reply functionality
- Edit tracking
- Message types

### Media
- File metadata
- S3 integration
- Thumbnail support
- Dimensions and duration

### Message Receipts
- Delivery status tracking
- Read receipts
- Timestamp management

## 🔧 Development

### Running in Development
```bash
# Server
cd apps/server
npm run dev

# Web
cd apps/web
npm run dev
```

### Database Management
```bash
# View database in Prisma Studio
npx prisma studio

# Reset database
npx prisma migrate reset

# Deploy migrations
npx prisma migrate deploy
```

### Building for Production
```bash
# Build server
cd apps/server
npm run build

# Build web
cd apps/web
npm run build
```

## 🚀 Deployment

### Server Deployment
1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Deploy to your preferred platform (Vercel, Railway, etc.)

### Web Deployment
1. Configure environment variables
2. Deploy to Vercel or similar platform
3. Update CORS settings for production domain

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter any issues or have questions, please:
1. Check the existing issues
2. Create a new issue with detailed information
3. Contact the development team

---

**Happy Chatting! 💬**
