import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-black text-white h-28 px-2">
      <div className="h-full flex items-end justify-between pb-2">
        {/* Logo - aligned to bottom */}
        <div className="flex items-end gap-3 h-full">
          <Image 
            src="/logo_text.png" 
            alt="ganttstop logo" 
            width={220} 
            height={60}
            className="object-contain"
          />
        </div>
        
        {/* Navigation - also aligned to bottom */}
        <nav className="flex gap-8 pb-1">
          <a href="/" className="hover:text-gray-300 transition">HOME</a>
          <a href="/my-gantts" className="hover:text-gray-300 transition">MY GANTTS</a>
          <a href="/customization" className="hover:text-gray-300 transition">CUSTOMIZATION</a>
          <a href="/help" className="hover:text-gray-300 transition">HELP</a>
        </nav>
        
        {/* User icon - also aligned to bottom */}
        <div className="pb-1">
          <div className="w-8 h-8 bg-white rounded-full"></div>
        </div>
      </div>
    </header>
  );
}