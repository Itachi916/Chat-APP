'use client';

import { useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [user, loading, error] = useAuthState(auth);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const router = useRouter();

  // Redirect to chat if already authenticated (only for manual navigation to /auth)
  useEffect(() => {
    if (user && !loading && !formLoading) {
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
            console.log('Auth page: User has profile, redirecting to chat');
            router.push('/chat');
          } else {
            // No profile, go to username setup
            console.log('Auth page: No profile found, redirecting to username');
            router.push('/username');
          }
        } catch (error) {
          console.error('Profile check error:', error);
          // On error, go to username setup
          router.push('/username');
        }
      };
      
      // Immediate redirect without delay
      checkProfileAndRedirect();
    }
  }, [user, loading, formLoading, router]);

  // Helper function to get user-friendly error messages
  const getErrorMessage = (error: any) => {
    const errorCode = error.code;
    
    // For security reasons, group authentication errors together
    const authErrors = [
      'auth/user-not-found',
      'auth/wrong-password', 
      'auth/invalid-credential',
      'auth/invalid-email',
      'auth/user-disabled'
    ];
    
    // Handle email already in use separately
    if (errorCode === 'auth/email-already-in-use') {
      return 'An account with this email already exists';
    }
    
    // If it's an authentication error, show generic message
    if (authErrors.includes(errorCode)) {
      return 'Wrong email or password. Please check your credentials and try again.';
    }
    
    switch (errorCode) {
      case 'auth/operation-not-allowed':
        return 'Email registration is not enabled. Please contact support.';
      case 'auth/popup-closed-by-user':
        return 'Login was cancelled. Please try again.';
      case 'auth/popup-blocked':
        return 'Popup was blocked by your browser. Please allow popups and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please choose a stronger password (at least 6 characters).';
      case 'auth/missing-password':
        return 'Please enter a password.';
      default:
        // For any other errors, show generic message to avoid exposing system details
        return 'Wrong email or password. Please check your credentials and try again.';
    }
  };

  // Social authentication handlers
  const handleGoogleSignIn = async () => {
    try {
      setFormLoading(true);
      setFormError('');
      
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      console.log('Google sign in successful:', user.uid);
      
      // Check if user already has a profile
      try {
        const token = await user.getIdToken();
        console.log('Got token, checking profile...');
        
        const profileResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        console.log('Profile response status:', profileResponse.status);

        if (profileResponse.ok) {
          // User already has a profile, go to chat
          console.log('Profile exists, redirecting to chat');
          window.location.href = '/chat';
        } else {
          // User needs to set username, go to username page
          console.log('No profile found, redirecting to username');
          window.location.href = '/username';
        }
      } catch (profileError) {
        console.error('Profile check error:', profileError);
        // On profile check error, go to username page
        window.location.href = '/username';
      }
    } catch (error: any) {
      console.error('Google sign in error:', error);
      setFormError(getErrorMessage(error));
    } finally {
      setFormLoading(false);
    }
  };


  // Helper function to create user profile
  const createUserProfile = async (user: any) => {
    const token = await user.getIdToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: user.displayName?.replace(/\s+/g, '').toLowerCase() || user.email?.split('@')[0],
        displayName: user.displayName || user.email?.split('@')[0],
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create user profile');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');

    try {
      if (isLogin) {
        // Login
        console.log('Attempting login with:', email);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Login successful:', user.uid);
        
        // Check if user has profile
        try {
          const token = await user.getIdToken();
          const profileResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (profileResponse.ok) {
            // User has profile, go to chat
            console.log('User has profile, redirecting to chat');
            router.push('/chat');
          } else {
            // User needs to set username, go to username page
            console.log('No profile found, redirecting to username');
            router.push('/username');
          }
        } catch (profileError) {
          console.error('Profile check error:', profileError);
          // On profile check error, go to username page
          router.push('/username');
        }
      } else {
        // Signup - always go to username page for new users
        console.log('Attempting signup with:', { email });
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Signup successful:', user.uid);

        // Always redirect new users to username page
        console.log('Redirecting new user to username page');
        router.push('/username');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setFormError(getErrorMessage(error));
    } finally {
      setFormLoading(false);
    }
  };

  // Show loading while checking auth state or redirecting
  if (loading || (user && !formLoading)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {loading ? 'Loading...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setFormError('');
              }}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          {formError && (
            <div className="text-red-600 text-sm text-center">
              {formError}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={formLoading || loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
            >
              {formLoading ? 'Loading...' : (isLogin ? 'Sign in' : 'Sign up')}
            </button>
          </div>
        </form>

        {/* Social Login Section */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-100 text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleSignIn}
              disabled={formLoading || loading}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="ml-2">Google</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
