import Header from "./components/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-8">Welcome to ganttstop</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Temporary placeholder card - we'll make this dynamic later */}
          <div className="bg-white rounded-lg shadow p-6 border-2 border-black">
            <div className="h-32 bg-gray-100 mb-4 flex items-center justify-center">
              <p className="text-gray-400">Gantt Preview</p>
            </div>
            <h3 className="font-bold text-lg mb-2">Gantt Title 1</h3>
            <p className="text-gray-600 text-sm">This is where your description goes.</p>
          </div>
        </div>
      </main>
    </div>
  );
}