export default function Header() {
  return (
    <header className="bg-black text-white h-16 flex items-center px-6">
      <div className="flex items-center gap-3">
        {/* Logo icon - temporary placeholder */}
        <div className="w-8 h-8 border-2 border-white flex items-center justify-center">
          <div className="text-xs font-bold">G</div>
        </div>
        <h1 className="text-xl font-bold">ganttstop</h1>
      </div>
      
      {/* Navigation */}
      <nav className="ml-12 flex gap-8">
        <a href="/" className="hover:text-gray-300 transition">HOME</a>
        <a href="/my-gantts" className="hover:text-gray-300 transition">MY GANTTS</a>
        <a href="/customization" className="hover:text-gray-300 transition">CUSTOMIZATION</a>
        <a href="/help" className="hover:text-gray-300 transition">HELP</a>
      </nav>
      
      {/* User icon placeholder - right side */}
      <div className="ml-auto">
        <div className="w-8 h-8 bg-white rounded-full"></div>
      </div>
    </header>
  );
}