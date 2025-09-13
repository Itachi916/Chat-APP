'use client';

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';

export default function UsernamePage() {
  const [user, loading] = useAuthState(auth);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [hasStartedSetup, setHasStartedSetup] = useState(false);
  const router = useRouter();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !loading) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  // Set display name from Firebase user
  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    } else if (user?.email) {
      // If no display name, use email prefix
      setDisplayName(user.email.split('@')[0]);
    }
  }, [user]);

  // Set flag that user is on username page (for main page to check)
  useEffect(() => {
    (window as any).__onUsernamePage = true;
    
    return () => {
      (window as any).__onUsernamePage = false;
    };
  }, []);

  // Check username availability
  const checkUsername = async (username: string) => {
    if (!username.trim()) return;
    
    setIsChecking(true);
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/check-username?username=${encodeURIComponent(username)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      if (data.available) {
        setError('');
      } else {
        setError('Username is already taken. Please choose a different one.');
      }
    } catch (error) {
      console.error('Username check error:', error);
    } finally {
      setIsChecking(false);
    }
  };

  // Handle username submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName || user?.displayName || user?.email?.split('@')[0] || 'User',
        }),
      });

      if (response.ok) {
        // Profile created successfully, redirect immediately
        console.log('Username page: Profile created successfully, redirecting to chat');
        window.location.href = '/chat';
      } else {
        const data = await response.json();
        if (data.error === 'Username already taken') {
          setError('Username is already taken. Please choose a different one.');
        } else {
          setError('Failed to create profile. Please try again.');
        }
      }
    } catch (error) {
      console.error('Profile creation error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
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

  // Redirect if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 text-blue-600">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Choose Your Username
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Pick a unique username that others will see in the chat
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setHasStartedSetup(true); // Mark that user has started setup
              }}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Your display name"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username *
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setHasStartedSetup(true); // Mark that user has started setup
                // Check username availability after user stops typing
                const timeoutId = setTimeout(() => {
                  if (e.target.value.trim()) {
                    checkUsername(e.target.value.trim());
                  }
                }, 500);
                return () => clearTimeout(timeoutId);
              }}
              className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Choose a unique username"
              required
            />
            {/* Reserved space for checking status to prevent UI shift */}
            <div className="mt-1 h-5 flex items-center">
              {isChecking && (
                <p className="text-sm text-gray-500">Checking availability...</p>
              )}
            </div>
          </div>

          {/* Reserved space for error message to prevent UI shift */}
          <div className="h-6 flex items-center justify-center">
            {error && (
              <div className="text-red-600 text-sm text-center">
                {error}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || isChecking || !username.trim()}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
            >
              {isLoading ? 'Creating Profile...' : 'Continue to Chat'}
            </button>
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={() => {
              auth.signOut();
              router.push('/auth');
            }}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Sign out and use different account
          </button>
        </div>
      </div>
    </div>
  );
}
