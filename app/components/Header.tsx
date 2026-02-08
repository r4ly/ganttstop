import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-black text-white h-32 px-3">
      <div className="h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 mt-6">
          <Image 
            src="/logo_text.png" 
            alt="ganttstop logo" 
            width={190} 
            height={60}
            className="object-contain"
          />
        </div>
        
        {/* Navigation - centered but pushed down slightly */}
        <nav className="flex gap-50 items-center mr-15 mt-6">
          <a href="/" className="hover:opacity-70 transition">
            <Image src="/home.png" alt="HOME" width={70} height={25} className="object-contain" />
          </a>
          <a href="/my-gantts" className="hover:opacity-70 transition">
            <Image src="/my-gantts.png" alt="MY GANTTS" width={120} height={25} className="object-contain" />
          </a>
          <a href="/customization" className="hover:opacity-70 transition">
            <Image src="/customization.png" alt="CUSTOMIZATION" width={170} height={25} className="object-contain" />
          </a>
          <a href="/help" className="hover:opacity-70 transition">
            <Image src="/help.png" alt="HELP" width={65} height={25} className="object-contain" />
          </a>
        </nav>
        
        {/* User profile icon - also pushed down */}
        <div className="mr-15 mt-6">
          <Image 
            src="/default-profile.png" 
            alt="Profile" 
            width={85} 
            height={40}
            className="rounded-full object-cover"
          />
        </div>
      </div>
    </header>
  );
}