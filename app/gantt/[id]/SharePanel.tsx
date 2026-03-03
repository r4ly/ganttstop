'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Role = 'viewer' | 'editor';

interface Collaborator {
  id: string;       // collaborator row id
  user_id: string;
  role: Role;
  username: string;
}

interface Props {
  chartId: string;
  onClose: () => void;
}

export default function SharePanel({ chartId, onClose }: Props) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-user form
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load current collaborators
  // ---------------------------------------------------------------------------
  const fetchCollaborators = async () => {
    // Flat query — avoids relying on a FK join between collaborators and profiles
    const { data: collabData, error } = await supabase
      .from('gantt_chart_collaborators')
      .select('id, user_id, role')
      .eq('chart_id', chartId)
      .order('created_at');

    if (!error && collabData && collabData.length > 0) {
      const userIds = collabData.map((c) => c.user_id);

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profileMap = Object.fromEntries(
        (profilesData ?? []).map((p) => [p.id, p.username]),
      );

      setCollaborators(
        collabData.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          role: row.role as Role,
          username: profileMap[row.user_id] ?? '(unknown)',
        })),
      );
    } else if (!error) {
      setCollaborators([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCollaborators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  // ---------------------------------------------------------------------------
  // Add collaborator
  // ---------------------------------------------------------------------------
  const handleInvite = async () => {
    const uname = inviteUsername.trim().toLowerCase();
    if (!uname) return;

    setInviting(true);
    setInviteError(null);

    // 1. Look up the profile by username
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', uname)
      .single();

    if (profileErr || !profile) {
      setInviteError(`No user found with username "${uname}"`);
      setInviting(false);
      return;
    }

    // 2. Check they're not the current user (can't invite yourself)
    const { data: me } = await supabase.auth.getUser();
    if (profile.id === me?.user?.id) {
      setInviteError("You can't invite yourself.");
      setInviting(false);
      return;
    }

    // 3. Check they're not already a collaborator
    const already = collaborators.some((c) => c.user_id === profile.id);
    if (already) {
      setInviteError(`${uname} is already a collaborator`);
      setInviting(false);
      return;
    }

    // 4. Insert the collaborator row — RLS ensures only the chart owner can do this
    const { error: insertErr } = await supabase.from('gantt_chart_collaborators').insert({
      chart_id: chartId,
      user_id: profile.id,
      role: inviteRole,
      invited_by: me?.user?.id,
    });

    if (insertErr) {
      setInviteError('Failed to add collaborator. You must be the chart owner.');
      setInviting(false);
      return;
    }

    setInviteUsername('');
    await fetchCollaborators();
    setInviting(false);
  };

  // ---------------------------------------------------------------------------
  // Change role
  // ---------------------------------------------------------------------------
  const handleChangeRole = async (collabId: string, newRole: Role) => {
    await supabase
      .from('gantt_chart_collaborators')
      .update({ role: newRole })
      .eq('id', collabId);
    setCollaborators((prev) =>
      prev.map((c) => (c.id === collabId ? { ...c, role: newRole } : c)),
    );
  };

  // ---------------------------------------------------------------------------
  // Remove collaborator
  // ---------------------------------------------------------------------------
  const handleRemove = async (collabId: string) => {
    await supabase.from('gantt_chart_collaborators').delete().eq('id', collabId);
    setCollaborators((prev) => prev.filter((c) => c.id !== collabId));
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/10 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="fixed right-0 top-0 h-full w-80 bg-white border-l border-gray-200 z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Share chart</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black text-xl leading-none transition"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">

          {/* ---- Add collaborator form ---- */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Invite by username
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="username"
                className="border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-black flex-1 min-w-0"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-black shrink-0"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteUsername.trim()}
              className="mt-2 w-full bg-black text-white py-1.5 rounded text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {inviting ? 'Adding...' : 'Add collaborator'}
            </button>
            {inviteError && (
              <p className="text-xs text-red-500 mt-1">{inviteError}</p>
            )}
          </section>

          {/* ---- Collaborator list ---- */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              People with access
            </p>

            {loading ? (
              <p className="text-xs text-gray-400">Loading...</p>
            ) : collaborators.length === 0 ? (
              <p className="text-xs text-gray-400">
                No collaborators yet. Invite someone above.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {collaborators.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0"
                  >
                    {/* Avatar placeholder */}
                    <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 uppercase">
                      {c.username[0]}
                    </span>

                    <span className="flex-1 text-sm truncate">{c.username}</span>

                    {/* Role selector */}
                    <select
                      value={c.role}
                      onChange={(e) => handleChangeRole(c.id, e.target.value as Role)}
                      className="border border-gray-200 rounded px-1.5 py-0.5 text-xs outline-none focus:border-black"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    {/* Remove */}
                    <button
                      onClick={() => handleRemove(c.id)}
                      className="text-gray-300 hover:text-red-500 transition text-base leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Editors can modify tasks. Viewers can only view.
          </p>
        </div>
      </aside>
    </>
  );
}
