'use client';

import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-blue-600 mb-4">💬</h1>
          <h2 className="text-4xl font-bold text-gray-900 mb-2">ChatApp</h2>
          <p className="text-xl text-gray-600 mb-8">
            Connect with friends in real-time
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Get Started
          </button>
          
          <p className="text-sm text-gray-500">
            Sign up or sign in to start chatting
          </p>
        </div>
        
        <div className="mt-12 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold text-gray-800">Real-time</h3>
            <p className="text-sm text-gray-600">Instant messaging</p>
          </div>
          <div>
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="font-semibold text-gray-800">Secure</h3>
            <p className="text-sm text-gray-600">End-to-end encryption</p>
          </div>
          <div>
            <div className="text-3xl mb-2">📱</div>
            <h3 className="font-semibold text-gray-800">Modern</h3>
            <p className="text-sm text-gray-600">Beautiful interface</p>
          </div>
        </div>
      </div>
    </div>
  );
}
