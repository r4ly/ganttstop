'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/context/AuthContext';
import { useGanttStore } from '@/lib/stores/ganttStore';
import { parseChartData } from '@/lib/schemas/chartData';
import Header from '@/app/components/Header';
import TaskSidebar from './TaskSidebar';
import Timeline from './Timeline';
import SharePanel from './SharePanel';

// Module-level singleton — stable reference, not recreated on every render
const supabase = createClient();

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved';

export default function GanttEditorPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const { loadChart, title, setTitle, tasks, isDirty, markClean, zoom, setZoom,
          collaboratorRole, setCollaboratorRole, undo, redo } = useGanttStore();
  const canEdit = collaboratorRole === 'owner' || collaboratorRole === 'editor';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [notFound, setNotFound] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [hasCollaborators, setHasCollaborators] = useState(false);

  // Keep refs so Realtime handlers can read latest values without stale closures
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  const collaboratorRoleRef = useRef(collaboratorRole);
  useEffect(() => { collaboratorRoleRef.current = collaboratorRole; }, [collaboratorRole]);

  // Track mutable values for the unmount cleanup below
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const titleRef = useRef(title);
  useEffect(() => { titleRef.current = title; }, [title]);
  const alreadyHandledRef = useRef(false); // set by handleBack to avoid double-delete

  // Auto-delete empty+untitled charts when navigating away via Header links etc.
  useEffect(() => {
    return () => {
      if (
        !alreadyHandledRef.current &&
        collaboratorRoleRef.current === 'owner' &&
        tasksRef.current.length === 0 &&
        titleRef.current.trim() === 'Untitled Gantt'
      ) {
        supabase.from('gantt_charts').delete().eq('id', id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fetch chart: allow owner OR collaborator ---
  useEffect(() => {
    if (!user || !id) return;
    let stale = false;

    const fetchChart = async () => {
      // RLS policy now allows owner + collaborators to SELECT
      const { data, error } = await supabase
        .from('gantt_charts')
        .select('id, title, chart_data, owner_id')
        .eq('id', id)
        .single();

      if (stale) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Determine role: owner or look up collaborator row
      let role: 'owner' | 'editor' | 'viewer' = 'viewer';
      if (data.owner_id === user.id) {
        role = 'owner';
        // Check if chart has any collaborators (used to decide Realtime subscription)
        const { count } = await supabase
          .from('gantt_chart_collaborators')
          .select('*', { count: 'exact', head: true })
          .eq('chart_id', id);
        if (!stale) setHasCollaborators((count ?? 0) > 0);
      } else {
        const { data: collab } = await supabase
          .from('gantt_chart_collaborators')
          .select('role')
          .eq('chart_id', id)
          .eq('user_id', user.id)
          .single();

        if (stale) return;

        if (!collab) {
          // No collaborator row — access denied
          setNotFound(true);
          setLoading(false);
          return;
        }
        role = collab.role as 'editor' | 'viewer';
        if (!stale) setHasCollaborators(true); // non-owners are themselves collaborators
      }

      // loadChart resets collaboratorRole to null, so set role AFTER it
      loadChart(data.id, data.title, parseChartData(data.chart_data));
      setCollaboratorRole(role);
      setLoading(false);
    };

    fetchChart();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  // --- Realtime: subscribe to remote changes from other editors ---
  useEffect(() => {
    if (!id || loading) return;
    // Skip subscription for solo owners — no collaborators means no one else can change the chart
    if (collaboratorRole === 'owner' && !hasCollaborators) return;

    const channel = supabase
      .channel(`chart-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gantt_charts', filter: `id=eq.${id}` },
        (payload) => {
          // Only apply remote update if we have no unsaved local changes
          if (!isDirtyRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = payload.new as any;
            loadChart(row.id, row.title, parseChartData(row.chart_data));
            // loadChart resets collaboratorRole — restore it from the ref
            if (collaboratorRoleRef.current) {
              setCollaboratorRole(collaboratorRoleRef.current);
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, hasCollaborators, collaboratorRole]);

  // --- Auto-save: 3-second debounce after any change ---
  useEffect(() => {
    if (!isDirty || !id || !user || !canEdit) return;
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
        .eq('id', id);
        // No .eq('owner_id') — editor collaborators also need to save.
        // Defense-in-depth is handled by the DB UPDATE RLS policy.

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
  }, [isDirty, tasks, title, id, user, canEdit]);

  // --- Undo / Redo keyboard shortcuts ---
  useEffect(() => {
    if (!canEdit) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      // Don't intercept while typing in an input/textarea
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canEdit, undo, redo]);

  // --- Save helper (used by both manual save and handleBack) ---
  const saveNow = async (): Promise<boolean> => {
    if (!id || !user || !canEdit) return false;
    const { error } = await supabase
      .from('gantt_charts')
      .update({ title, chart_data: { tasks }, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) markClean();
    return !error;
  };

  // --- Back button: save → delete if empty/untitled → navigate ---
  const handleBack = async () => {
    alreadyHandledRef.current = true; // prevent unmount effect from double-deleting
    if (canEdit) {
      if (tasks.length === 0 && title.trim() === 'Untitled Gantt') {
        // Mark clean first so the auto-save debounce doesn't fire on a deleted row
        markClean();
        await supabase.from('gantt_charts').delete().eq('id', id);
      } else if (isDirty) {
        const saved = await saveNow();
        if (!saved) return; // Don't navigate if save failed
      }
    }
    router.push('/dashboard');
  };

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
    if (!id || !user || saving || !canEdit) return;
    setSaving(true);
    setSaveStatus('saving');

    const { error } = await supabase
      .from('gantt_charts')
      .update({
        title,
        chart_data: { tasks },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

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

        {/* Back arrow */}
        <button
          onClick={handleBack}
          className="text-gray-400 hover:text-gray-700 transition shrink-0 -ml-1"
          title="Back to dashboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

      {/* Toolbar title — read only for viewers */}
        <input
          type="text"
          value={title}
          onChange={(e) => canEdit && setTitle(e.target.value)}
          readOnly={!canEdit}
          className={`text-xl font-bold bg-transparent border-none outline-none flex-1 min-w-0 ${
            !canEdit ? 'cursor-default select-none' : ''
          }`}
          placeholder="Untitled Gantt"
        />

        {/* Zoom toggle */}
        <div className="flex items-center border border-gray-200 rounded overflow-hidden shrink-0">
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1 text-xs font-medium transition capitalize ${
                zoom === z ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {z}
            </button>
          ))}
        </div>

        {/* Viewer badge */}
        {collaboratorRole === 'viewer' && (
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-2 py-0.5 shrink-0">
            View only
          </span>
        )}

        {canEdit && (
          <span className={`text-xs shrink-0 ${statusColor[saveStatus]}`}>
            {statusText[saveStatus]}
          </span>
        )}

        {/* Share button — owner only */}
        {collaboratorRole === 'owner' && (
          <button
            onClick={() => setShareOpen((o) => !o)}
            className="border border-gray-200 text-gray-600 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 transition shrink-0"
          >
            Share
          </button>
        )}

        {canEdit && (
          <button
            onClick={handleManualSave}
            disabled={!isDirty || saving}
            className="bg-black text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition shrink-0"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {/* Editor: sidebar + timeline */}
      <div className="flex flex-1 overflow-hidden">
        <TaskSidebar />
        <Timeline />
      </div>

      {/* Share panel slide-over */}
      {shareOpen && (
        <SharePanel chartId={id} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}