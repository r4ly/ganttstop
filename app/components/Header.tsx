'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="bg-black text-white h-32 px-3">
      <div className="h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 mt-6">
          <Link href="/">
            <Image 
              src="/logo_text.png" 
              alt="ganttstop logo" 
              width={190} 
              height={60}
              className="object-contain"
            />
          </Link>
        </div>
        
        {/* Navigation */}
        <nav className="flex gap-50 items-center mr-15 mt-6">
          <Link href="/" className="hover:opacity-70 transition">
            <Image src="/home.png" alt="HOME" width={70} height={25} className="object-contain" />
          </Link>
          <Link href="/my-gantts" className="hover:opacity-70 transition">
            <Image src="/my-gantts.png" alt="MY GANTTS" width={120} height={25} className="object-contain" />
          </Link>
          <Link href="/customization" className="hover:opacity-70 transition">
            <Image src="/customization.png" alt="CUSTOMIZATION" width={170} height={25} className="object-contain" />
          </Link>
          <Link href="/help" className="hover:opacity-70 transition">
            <Image src="/help.png" alt="HELP" width={65} height={25} className="object-contain" />
          </Link>
        </nav>
        
        {/* Auth section */}
        <div className="mr-15 mt-6">
          {user ? (
            <div className="flex items-center gap-3">
              <Link href="/profile">
                <Image 
                  src={user.user_metadata?.avatar_url ?? '/default-profile.png'}
                  alt="Profile" 
                  width={40} 
                  height={40}
                  className="rounded-full object-cover hover:opacity-80 transition"
                />
              </Link>
              <button
                onClick={signOut}
                className="text-sm text-white hover:opacity-70 transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/auth/signin"
              className="text-sm text-white border border-white px-4 py-2 rounded hover:bg-white hover:text-black transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}