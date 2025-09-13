'use client';

import { useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();

  // Check profile completion before redirecting
  useEffect(() => {
    if (user && !loading) {
      // Check if user was on username page and should be signed out
      // Only sign out if they were on username page but didn't complete setup
      if ((window as any).__onUsernamePage) {
        // User was on username page, check if they completed setup
        // If they're here, it means they didn't complete setup, so sign them out
        auth.signOut();
        return;
      }

      const checkProfileAndRedirect = async () => {
        try {
          const token = await user.getIdToken();
          const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (response.ok) {
            // Profile exists, go to chat
            router.push('/chat');
          } else {
            // No profile, go to username setup
            router.push('/username');
          }
        } catch (error) {
          console.error('Profile check error:', error);
          // On error, go to username setup
          router.push('/username');
        }
      };
      
      checkProfileAndRedirect();
    }
  }, [user, loading, router]);

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show redirect message if user is authenticated
  if (user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to chat...</p>
          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-500">User: {user.email}</p>
            <button
              onClick={() => signOut(auth)}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Sign out instead
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="w-full py-6 px-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">💬</span>
            </div>
            <span className="text-xl font-bold text-gray-900">ChatApp</span>
          </div>
          <button
            onClick={() => router.push('/auth')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Connect with
              <span className="text-blue-600 block">Friends</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Experience real-time messaging with a beautiful, modern interface. 
              Chat with friends, share media, and stay connected.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push('/auth')}
                className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
              >
                Get Started Free
              </button>
              <button className="border border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors">
                Learn More
              </button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Real-time</h3>
              <p className="text-gray-600">
                Instant messaging with live typing indicators and message delivery status
              </p>
            </div>
            
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Secure</h3>
              <p className="text-gray-600">
                End-to-end encryption and secure authentication with Firebase
              </p>
            </div>
            
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📱</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Modern</h3>
              <p className="text-gray-600">
                Beautiful, responsive design that works on all devices
              </p>
            </div>
          </div>

          {/* Additional Features */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="text-left">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Share Everything
              </h2>
              <p className="text-gray-600 mb-6">
                Send text messages, photos, videos, and files. Express yourself with 
                emojis, stickers, and more. Everything you need for modern communication.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-gray-700">Text and voice messages</span>
                </li>
                <li className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-gray-700">Photo and video sharing</span>
                </li>
                <li className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-gray-700">File sharing</span>
                </li>
                <li className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-gray-700">Group conversations</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-gray-100 rounded-2xl p-8 text-center">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-6xl">💬</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Chat?</h3>
              <p className="text-gray-600 mb-4">
                Join thousands of users already chatting
              </p>
              <button
                onClick={() => router.push('/auth')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Start Chatting Now
              </button>
      </div>
          </div>
      </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 px-4 border-t border-gray-200">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-gray-500">
            © 2024 ChatApp. Built with Next.js, Firebase, and Socket.IO
          </p>
      </div>
      </footer>
    </div>
  );
}
