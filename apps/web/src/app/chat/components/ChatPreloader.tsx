'use client';

import { useEffect } from 'react';
import { auth } from '../../../lib/firebase';
import { getSocket } from '../../../lib/socket';

// Preload critical resources for chat page
export default function ChatPreloader() {
  useEffect(() => {
    // Preload Firebase auth
    if (auth.currentUser) {
      auth.currentUser.getIdToken();
    }

    // Preload socket connection
    getSocket().catch(console.error);

    // Preload critical API endpoints
    const preloadEndpoints = [
      '/api/conversations',
      '/api/users/me'
    ];

    preloadEndpoints.forEach(endpoint => {
      fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}${endpoint}`, {
        method: 'HEAD', // Just check if endpoint exists
      }).catch(() => {
        // Ignore errors, this is just preloading
      });
    });
  }, []);

  return null; // This component doesn't render anything
}
