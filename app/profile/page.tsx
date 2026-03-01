'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';

export default function ProfilePage() {
  const { user, username, loading, signOut } = useAuth();

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center py-32">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-lg mx-auto px-8 py-16">
        <h1 className="text-3xl font-bold mb-10">Profile</h1>

        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-10">
          <Image
            src={user.user_metadata?.avatar_url ?? '/default-profile.png'}
            alt="Profile picture"
            width={72}
            height={72}
            className="rounded-full object-cover"
          />
          <div>
            <p className="text-xl font-semibold">
              {user.user_metadata?.full_name ?? 'Unknown'}
            </p>
            <p className="text-gray-500 text-sm">{user.email}</p>
          </div>
        </div>

        {/* Username */}
        <div className="mb-8 p-5 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Username</p>
          <p className="text-lg font-mono">@{username}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/onboarding/username"
            className="w-full text-center border border-gray-300 px-6 py-3 rounded font-semibold hover:bg-gray-50 transition"
          >
            Change Username
          </Link>
          <button
            onClick={signOut}
            className="w-full border border-red-300 text-red-600 px-6 py-3 rounded font-semibold hover:bg-red-50 transition"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
