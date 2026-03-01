'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/context/AuthContext';
import { useGanttStore } from '@/lib/stores/ganttStore';
import { parseChartData } from '@/lib/schemas/chartData';
import Header from '@/app/components/Header';
import TaskSidebar from './TaskSidebar';
import Timeline from './Timeline';

// Module-level singleton — stable reference, not recreated on every render
const supabase = createClient();

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved';

export default function GanttEditorPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const { loadChart, title, setTitle, tasks, isDirty, markClean } = useGanttStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [notFound, setNotFound] = useState(false);

  // --- Fetch chart (race-condition safe via stale flag) ---
  useEffect(() => {
    if (!user || !id) return;
    let stale = false;

    const fetchChart = async () => {
      const { data, error } = await supabase
        .from('gantt_charts')
        .select('id, title, chart_data, owner_id')
        .eq('id', id)
        .single();

      if (stale) return;

      if (error || !data || data.owner_id !== user.id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Validate chart_data at runtime — corrupt JSON becomes { tasks: [] }
      loadChart(data.id, data.title, parseChartData(data.chart_data));
      setLoading(false);
    };

    fetchChart();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  // --- Auto-save: 3-second debounce after any change ---
  useEffect(() => {
    if (!isDirty || !id || !user) return;
    setSaveStatus('pending');

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');

      const { error } = await supabase
        .from('gantt_charts')
        .update({
          title,
          chart_data: { tasks },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', user.id); // defense-in-depth on top of RLS

      setSaving(false);
      if (!error) {
        markClean();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('idle');
      }
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, tasks, title, id, user]);

  // --- Warn before closing with unsaved changes ---
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // --- Manual save button ---
  const handleManualSave = async () => {
    if (!id || !user || saving) return;
    setSaving(true);
    setSaveStatus('saving');

    const { error } = await supabase
      .from('gantt_charts')
      .update({
        title,
        chart_data: { tasks },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', user.id);

    setSaving(false);
    if (!error) {
      markClean();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const statusText: Record<SaveStatus, string> = {
    idle: isDirty ? 'Unsaved changes' : 'All changes saved',
    pending: 'Changes pending...',
    saving: 'Saving...',
    saved: 'Saved',
  };

  const statusColor: Record<SaveStatus, string> = {
    idle: isDirty ? 'text-orange-400' : 'text-gray-400',
    pending: 'text-orange-400',
    saving: 'text-orange-400',
    saved: 'text-green-500',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center py-32">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-gray-500 text-lg">Chart not found.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-black text-white px-5 py-2 rounded"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <Header />

      {/* Toolbar */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-xl font-bold bg-transparent border-none outline-none flex-1 min-w-0"
          placeholder="Untitled Gantt"
        />
        <span className={`text-xs shrink-0 ${statusColor[saveStatus]}`}>
          {statusText[saveStatus]}
        </span>
        <button
          onClick={handleManualSave}
          disabled={!isDirty || saving}
          className="bg-black text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition shrink-0"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Editor: sidebar + timeline */}
      <div className="flex flex-1 overflow-hidden">
        <TaskSidebar />
        <Timeline />
      </div>
    </div>
  );
}