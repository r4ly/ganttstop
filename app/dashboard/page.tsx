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

interface MiniTask {
  startDate?: string;
  endDate?: string;
  bars?: { startDate: string; endDate: string }[];
  color: string;
}

interface GanttChart {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  chart_data?: { tasks: MiniTask[] };
}

interface SharedChartWithData extends SharedChart {
  chart_data?: { tasks: MiniTask[] };
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
        .select('id, title, updated_at, created_at, chart_data')
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
          .select('id, title, updated_at, owner_id, chart_data')
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

          const mapped: SharedChartWithData[] = sharedData
            .map((c) => ({
              id: c.id,
              title: c.title,
              updated_at: c.updated_at,
              role: roleMap[c.id] as 'editor' | 'viewer',
              owner_username: profileMap[c.owner_id] ?? 'unknown',
              chart_data: c.chart_data,
            }))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

          setSharedCharts(mapped as SharedChart[]);
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

    const { error } = await supabase
      .from('gantt_charts')
      .delete()
      .eq('id', id)
      .eq('owner_id', user?.id ?? '');

    if (error) {
      console.error('Failed to delete chart:', error.message);
      return;
    }
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {sharedCharts.map((chart) => (
                <Link
                  key={chart.id}
                  href={`/gantt/${chart.id}`}
                  className="border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition block flex flex-col"
                >
                  <MiniGantt tasks={(chart as SharedChartWithData).chart_data?.tasks ?? []} />
                  <h3 className="font-semibold text-sm truncate">{chart.title}</h3>
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
// Mini Gantt preview component — renders real colored bars from chart_data
// ---------------------------------------------------------------------------
function MiniGantt({ tasks }: { tasks: MiniTask[] }) {
  // Flatten bars from both old format (startDate/endDate) and new (bars[])
  const allBars: { startDate: string; endDate: string; color: string }[] = tasks.flatMap((t) => {
    if (t.bars && t.bars.length > 0) {
      return t.bars.map((b) => ({ startDate: b.startDate, endDate: b.endDate, color: t.color }));
    }
    if (t.startDate && t.endDate) {
      return [{ startDate: t.startDate, endDate: t.endDate, color: t.color }];
    }
    return [];
  });

  const PREVIEW_H = 120; // usable px inside container
  const BAR_GAP   = 3;
  const MIN_BAR_H = 3;
  const MAX_BAR_H = 10;

  if (allBars.length === 0) {
    return (
      <div className="h-32 bg-gray-100 rounded-md mb-3 flex items-center gap-1 px-2 overflow-hidden">
        <div className="h-2 bg-gray-300 rounded-sm w-1/3" />
        <div className="h-2 bg-gray-300 rounded-sm w-1/4 ml-3" />
        <div className="h-2 bg-gray-300 rounded-sm w-1/5 ml-2" />
      </div>
    );
  }

  const toMs = (d: string) => new Date(d).getTime();
  const minTime = Math.min(...allBars.map((b) => toMs(b.startDate)));
  const maxTime = Math.max(...allBars.map((b) => toMs(b.endDate)));
  const totalMs = maxTime - minTime || 1;

  // Adaptive bar height: shrink to fit, but never below MIN_BAR_H
  const n      = allBars.length;
  const target = Math.floor((PREVIEW_H - (n - 1) * BAR_GAP) / n);
  const barH   = Math.max(MIN_BAR_H, Math.min(MAX_BAR_H, target));
  // Max bars that physically fit at this height
  const maxBars   = Math.floor((PREVIEW_H + BAR_GAP) / (barH + BAR_GAP));
  const visible   = allBars.slice(0, maxBars);

  return (
    <div className="h-32 bg-gray-100 rounded-md mb-3 relative overflow-hidden">
      {visible.map((bar, i) => {
        const left  = ((toMs(bar.startDate) - minTime) / totalMs) * 100;
        const width = Math.max(2, ((toMs(bar.endDate) - toMs(bar.startDate)) / totalMs) * 100);
        const top   = 4 + i * (barH + BAR_GAP);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left:   `${left}%`,
              width:  `${width}%`,
              top,
              height: barH,
              backgroundColor: bar.color,
              borderRadius: 2,
              opacity: 0.85,
            }}
          />
        );
      })}
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {charts.map((chart) => (
        <div
          key={chart.id}
          className="border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition group relative flex flex-col"
        >
          <Link href={`/gantt/${chart.id}`} className="block flex-1">
            <MiniGantt tasks={chart.chart_data?.tasks ?? []} />
            <h3 className="font-semibold text-sm truncate">{chart.title}</h3>
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