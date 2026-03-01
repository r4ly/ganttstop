import Link from "next/link";
import Header from "./components/Header";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main className="max-w-4xl mx-auto px-8 py-20 text-center">
        <h1 className="text-5xl font-bold mb-6">Welcome to ganttstop</h1>
        <p className="text-xl text-gray-600 mb-8">
          Create, share, and collaborate on gantts with a modern, sleek design
        </p>
        <div className="flex gap-4 justify-center">
          <Link 
            href="/auth/signin" 
            className="bg-black text-white px-8 py-3 rounded font-semibold hover:bg-gray-800"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  );
}