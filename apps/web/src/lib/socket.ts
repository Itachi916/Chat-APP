let socketInstance: any = null;

export async function getSocket() {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }
  
  const { io } = await import('socket.io-client');
  socketInstance = io(process.env.NEXT_PUBLIC_SERVER_URL as string, { 
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function emitJoin(socket: any, userId: string) {
  socket.emit('join', userId);
}

export function emitTyping(socket: any, toUserId: string, conversationId: string) {
  socket.emit('typing', { toUserId, conversationId });
}
