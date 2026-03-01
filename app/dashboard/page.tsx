'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { createClient } from '@/lib/supabase/client';
import Header from '../components/Header';

// Module-level client — stable across renders, removes it from useEffect deps
const supabase = createClient();

interface GanttChart {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

interface SharedChart {
  id: string;
  title: string;
  updated_at: string;
  role: 'editor' | 'viewer';
  owner_username: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const [charts, setCharts] = useState<GanttChart[]>([]);
  const [sharedCharts, setSharedCharts] = useState<SharedChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Fetch all charts owned by the current user
  useEffect(() => {
    if (!user) return;

    const fetchCharts = async () => {
      // ---- Owned charts ----
      const { data: ownedData, error: ownedErr } = await supabase
        .from('gantt_charts')
        .select('id, title, updated_at, created_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false });

      if (!ownedErr && ownedData) setCharts(ownedData);

      // ---- Shared charts (3 flat queries — no fragile PostgREST joins) ----
      const { data: collabData } = await supabase
        .from('gantt_chart_collaborators')
        .select('role, chart_id')
        .eq('user_id', user.id);

      if (collabData && collabData.length > 0) {
        const chartIds = collabData.map((c) => c.chart_id);

        const { data: sharedData } = await supabase
          .from('gantt_charts')
          .select('id, title, updated_at, owner_id')
          .in('id', chartIds);

        if (sharedData) {
          const ownerIds = [...new Set(sharedData.map((c) => c.owner_id))];
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', ownerIds);

          const profileMap = Object.fromEntries(
            (profilesData ?? []).map((p) => [p.id, p.username]),
          );
          const roleMap = Object.fromEntries(
            collabData.map((c) => [c.chart_id, c.role]),
          );

          const mapped: SharedChart[] = sharedData
            .map((c) => ({
              id: c.id,
              title: c.title,
              updated_at: c.updated_at,
              role: roleMap[c.id] as 'editor' | 'viewer',
              owner_username: profileMap[c.owner_id] ?? 'unknown',
            }))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

          setSharedCharts(mapped);
        }
      }

      setLoading(false);
    };

    fetchCharts().catch(() => setLoading(false));
  }, [user]);

  // Create a new blank gantt chart and navigate into the editor
  const handleCreateChart = async () => {
    if (!user || creating) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('gantt_charts')
      .insert({
        owner_id: user.id,
        title: 'Untitled Gantt',
        chart_data: { tasks: [] },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create chart:', error.message);
      setCreating(false);
      return;
    }

    router.push(`/gantt/${data.id}`);
  };

  const handleDeleteChart = async (id: string) => {
    const confirmed = window.confirm('Delete this gantt chart? This cannot be undone.');
    if (!confirmed) return;

    await supabase.from('gantt_charts').delete().eq('id', id).eq('owner_id', user?.id ?? '');
    setCharts((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-7xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold">My Gantts</h2>
          <button
            onClick={handleCreateChart}
            disabled={creating}
            className="bg-black text-white px-5 py-2.5 rounded font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {creating ? 'Creating...' : '+ New Gantt'}
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-20">Loading...</p>
        ) : charts.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500 text-lg mb-5">No gantts yet</p>
            <button
              onClick={handleCreateChart}
              disabled={creating}
              className="bg-black text-white px-6 py-3 rounded font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
            >
              {creating ? 'Creating...' : 'Create Your First Gantt'}
            </button>
          </div>
        ) : (
          <ChartGrid charts={charts} onDelete={handleDeleteChart} />
        )}

        {/* ---- Shared with me ---- */}
        {!loading && sharedCharts.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-bold mb-6">Shared with me</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedCharts.map((chart) => (
                <Link
                  key={chart.id}
                  href={`/gantt/${chart.id}`}
                  className="border border-gray-200 rounded-xl p-5 hover:border-gray-400 transition block"
                >
                  {/* Mini preview */}
                  <div className="h-12 bg-gray-50 rounded-md mb-4 flex items-center gap-1 px-2 overflow-hidden">
                    <div className="h-3 bg-black rounded-sm opacity-20 w-1/3" />
                    <div className="h-3 bg-black rounded-sm opacity-20 w-1/4 ml-3" />
                    <div className="h-3 bg-black rounded-sm opacity-20 w-1/5 ml-2" />
                  </div>
                  <h3 className="font-semibold text-base truncate">{chart.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Updated {formatDistanceToNow(new Date(chart.updated_at), { addSuffix: true })}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-400">by {chart.owner_username}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                      chart.role === 'editor'
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {chart.role}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owned-chart grid (extracted so it stays readable)
// ---------------------------------------------------------------------------
function ChartGrid({
  charts,
  onDelete,
}: {
  charts: GanttChart[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {charts.map((chart) => (
        <div
          key={chart.id}
          className="border border-gray-200 rounded-xl p-5 hover:border-gray-400 transition group relative"
        >
          <Link href={`/gantt/${chart.id}`} className="block">
            {/* Mini preview bar strip */}
            <div className="h-12 bg-gray-50 rounded-md mb-4 flex items-center gap-1 px-2 overflow-hidden">
              <div className="h-3 bg-black rounded-sm opacity-20 w-1/3" />
              <div className="h-3 bg-black rounded-sm opacity-20 w-1/4 ml-3" />
              <div className="h-3 bg-black rounded-sm opacity-20 w-1/5 ml-2" />
            </div>
            <h3 className="font-semibold text-base truncate">{chart.title}</h3>
            <p className="text-xs text-gray-400 mt-1">
              Updated {formatDistanceToNow(new Date(chart.updated_at), { addSuffix: true })}
            </p>
          </Link>
          <button
            onClick={() => onDelete(chart.id)}
            className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition text-lg leading-none opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}