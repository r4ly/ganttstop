'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

export default function SetUsername() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3-20 characters and only contain letters, numbers, or underscores.');
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', user.id);

      if (updateError) {
        if (updateError.code === '23505') {
          setError('That username is already taken. Please choose another.');
        } else {
          throw updateError;
        }
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 text-center">
        <Image
          src="/logo_text.png"
          alt="ganttstop"
          width={190}
          height={60}
          className="object-contain mx-auto mb-8"
        />

        <h2 className="text-2xl font-bold mb-2">Choose your username</h2>
        <p className="text-gray-500 mb-8">
          This is how others will find and identify you on ganttstop.
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            maxLength={20}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-black text-center text-lg"
          />
          <p className="text-xs text-gray-400">
            3-20 characters. Letters, numbers, and underscores only.
          </p>
          <button
            type="submit"
            disabled={loading || username.length < 3}
            className="w-full bg-black text-white py-2 rounded font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
