export async function getSocket() {
  const { io } = await import('socket.io-client');
  const socket = io(process.env.NEXT_PUBLIC_SERVER_URL as string, { withCredentials: true });
  return socket;
}

export function emitJoin(socket: any, userId: string) {
  socket.emit('join', userId);
}

export function emitTyping(socket: any, toUserId: string, conversationId: string) {
  socket.emit('typing', { toUserId, conversationId });
}
