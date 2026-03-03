'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useGanttStore, Task } from '@/lib/stores/ganttStore';

// Exposed for parent drag: sets dataTransfer to the task id
// so the Timeline can create a new bar on drop.
const TASK_COLORS = [
  '#ff6b9d',
  '#3ff37d',
  '#f7ca1d',
  '#f79e1d',
  '#6366f1',
  '#ef4444',
  '#000000',
];

const today = () => new Date().toISOString().slice(0, 10);
const weekFromToday = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
};

interface TaskFormState {
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}

const defaultForm = (): TaskFormState => ({
  name: '',
  startDate: today(),
  endDate: weekFromToday(),
  color: '#ff6b9d',
});

export default function TaskSidebar() {
  const { tasks, addTask, updateTask, updateBar, deleteTask, reorderTasks, collaboratorRole, pendingNewTaskDates, setPendingNewTaskDates, setPendingPhantomBar } = useGanttStore();
  const canEdit = collaboratorRole === 'owner' || collaboratorRole === 'editor';

  // --- dnd-kit sensors ---
  // PointerSensor with an activation distance prevents accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTasks(arrayMove(tasks, oldIndex, newIndex));
    }
  };

  // Which task is selected (for editing)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Whether the "add task" form is open
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TaskFormState>(defaultForm);
  const addFormRef = useRef<HTMLDivElement>(null);
  // Edit form state (keyed by task id)
  const [editForm, setEditForm] = useState<TaskFormState>(defaultForm);

  // Sidebar scroll ref for cross-component scroll-sync with Timeline (fix #7)
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const { scrollTop, source } = (e as CustomEvent<{ scrollTop: number; source: string }>).detail;
      if (source === 'timeline' && scrollRef.current && !isSyncingScrollRef.current) {
        isSyncingScrollRef.current = true;
        scrollRef.current.scrollTop = scrollTop;
        requestAnimationFrame(() => { isSyncingScrollRef.current = false; });
      }
    };
    window.addEventListener('gantt:scrollY', handler);
    return () => window.removeEventListener('gantt:scrollY', handler);
  }, []);

  // Scroll form into view whenever it opens
  useEffect(() => {
    if (addOpen) addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [addOpen]);

  // When the Timeline phantom row is drawn, open the add form pre-filled with those dates
  useEffect(() => {
    if (!pendingNewTaskDates) return;
    setAddForm((f) => ({ ...f, startDate: pendingNewTaskDates.startDate, endDate: pendingNewTaskDates.endDate }));
    setAddOpen(true);
    setSelectedId(null);
    setPendingNewTaskDates(null);
    // pendingPhantomBar is set separately — keep it alive until submit/cancel
  }, [pendingNewTaskDates, setPendingNewTaskDates]);

  const handleSelectTask = (task: Task) => {
    if (selectedId === task.id) {
      setSelectedId(null);
    } else {
      setSelectedId(task.id);
      // Populate form with first bar's dates (fallback to today/+7)
      const firstBar = task.bars[0];
      setEditForm({
        name: task.name,
        startDate: firstBar?.startDate ?? today(),
        endDate:   firstBar?.endDate   ?? weekFromToday(),
        color: task.color,
      });
      setAddOpen(false);
    }
  };

  const handleSaveEdit = () => {
    if (!selectedId) return;
    // Update task meta (name + color)
    updateTask(selectedId, { name: editForm.name.trim(), color: editForm.color });
    // Update first bar's dates if it exists
    const task = tasks.find((t) => t.id === selectedId);
    if (task && task.bars.length > 0) {
      updateBar(selectedId, task.bars[0].id, { startDate: editForm.startDate, endDate: editForm.endDate });
    }
    setSelectedId(null);
  };

  const handleAddTask = () => {
    if (!addForm.name.trim()) return;
    addTask({
      id: crypto.randomUUID(),
      name: addForm.name.trim(),
      color: addForm.color,
      bars: [{
        id: crypto.randomUUID(),
        startDate: addForm.startDate,
        endDate: addForm.endDate,
      }],
    });
    setAddForm(defaultForm());
    setAddOpen(false);
    setPendingPhantomBar(null);
  };

  const handleDelete = (id: string) => {
    if (selectedId === id) setSelectedId(null);
    deleteTask(id);
  };

  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Height matches Timeline HEADER_H = 56px so task rows stay aligned */}
      <div className="h-14 px-4 shrink-0 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Tasks</h3>
        {canEdit && (
          <button
            onClick={() => {
              setAddOpen((o) => !o);
              setSelectedId(null);
              setPendingPhantomBar(null);
            }}
            className="text-sm bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition"
          >
            + Add
          </button>
        )}
      </div>

      {/* Task list */}
<div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={(e) => {
          if (isSyncingScrollRef.current) return;
          isSyncingScrollRef.current = true;
          window.dispatchEvent(new CustomEvent('gantt:scrollY', { detail: { scrollTop: e.currentTarget.scrollTop, source: 'sidebar' } }));
          requestAnimationFrame(() => { isSyncingScrollRef.current = false; });
        }}>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                canEdit={canEdit}
                isSelected={selectedId === task.id}
                editForm={editForm}
                onSelect={() => handleSelectTask(task)}
                onDelete={() => handleDelete(task.id)}
                onEditChange={setEditForm}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setSelectedId(null)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Phantom "add a task" row — hidden when form is open */}
        {canEdit && !addOpen && (
          <button
            onClick={() => { setAddOpen(true); setSelectedId(null); }}
            className="flex items-center gap-2 px-4 h-11 w-full text-left text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition border-t border-dashed border-gray-100 group"
          >
            <span className="text-gray-300 group-hover:text-gray-400 text-base leading-none select-none">⠿</span>
            <span className="w-3 h-3 rounded-full shrink-0 border-2 border-dashed border-gray-200 group-hover:border-gray-300" />
            <span className="text-sm italic">Add a task...</span>
          </button>
        )}
        {/* Add task form — pinned just below the phantom row */}
        {addOpen && (
          <div ref={addFormRef} className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <TaskForm
              form={addForm}
              onChange={setAddForm}
              onSubmit={handleAddTask}
              onCancel={() => { setAddOpen(false); setPendingPhantomBar(null); setAddForm(defaultForm()); }}
              submitLabel="Add Task"
            />
          </div>
        )}
        {/* "No tasks" hint lives below the phantom row */}
        {tasks.length === 0 && !addOpen && (
          <p className="text-xs text-gray-400 text-center mt-4 px-4">
            No tasks yet. Click &quot;+ Add&quot; to create one.
          </p>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sortable task row — wraps the task display with dnd-kit drag-handle
// ---------------------------------------------------------------------------
function SortableTaskRow({
  task,
  canEdit,
  isSelected,
  editForm,
  onSelect,
  onDelete,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
}: {
  task: Task;
  canEdit: boolean;
  isSelected: boolean;
  editForm: TaskFormState;
  onSelect: () => void;
  onDelete: () => void;
  onEditChange: (f: TaskFormState) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Task row — height matches Timeline ROW_H = 44px */}
      <div
        className={`flex items-center gap-2 px-4 h-11 shrink-0 hover:bg-gray-50 transition group ${
          isSelected ? 'bg-gray-100' : ''
        }`}
        onClick={canEdit ? onSelect : undefined}
        style={{ cursor: canEdit ? 'pointer' : 'default' }}
      >
        {/* Reorder drag handle — only interactive for editors/owners */}
        <span
          {...attributes}
          {...(canEdit ? listeners : {})}
          onClick={(e) => e.stopPropagation()}
          className={`shrink-0 select-none ${canEdit ? 'text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing' : 'text-gray-200 cursor-default'}`}
          title={canEdit ? 'Drag to reorder' : undefined}
        >
          ⠿
        </span>

        {/* Timeline drag handle — HTML5 drag to reschedule on the timeline */}
        {canEdit && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', task.id);
              e.dataTransfer.effectAllowed = 'move';
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 select-none text-gray-300 hover:text-blue-400 transition cursor-grab active:cursor-grabbing text-xs"
            title="Drag onto the timeline to reschedule"
          >
            ↔
          </span>
        )}

        {/* Color dot */}
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: task.color }} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.name}</p>
          {task.bars.length === 0 && (
            <p className="text-xs text-gray-300 italic">no segments</p>
          )}
          {task.bars.length === 1 && (
            <p className="text-xs text-gray-400">{task.bars[0].startDate} → {task.bars[0].endDate}</p>
          )}
          {task.bars.length > 1 && (
            <p className="text-xs text-gray-400">{task.bars.length} segments</p>
          )}
        </div>

        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 shrink-0"
            title="Delete task"
          >
            ×
          </button>
        )}
      </div>

      {/* Inline edit form — shown only if user can edit */}
      {isSelected && canEdit && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <TaskForm
            form={editForm}
            onChange={onEditChange}
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
            submitLabel="Save"
          />
        </div>
      )}
    </div>
  );
}

// Reusable form for add/edit
function TaskForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: TaskFormState;
  onChange: (f: TaskFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const dateError = form.endDate && form.startDate && form.endDate < form.startDate
    ? 'End date must be after start date'
    : null;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Task name"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-black"
        autoFocus
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Start</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-black"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400">End</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => onChange({ ...form, endDate: e.target.value })}
            className={`w-full border rounded px-2 py-1 text-xs outline-none focus:border-black ${
              dateError ? 'border-red-400' : 'border-gray-200'
            }`}
          />
        </div>
      </div>
      {dateError && <p className="text-xs text-red-500">{dateError}</p>}

      {/* Color picker */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TASK_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ ...form, color: c })}
            className={`w-5 h-5 rounded-full border-2 transition ${
              form.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110 border-transparent' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        {/* Custom hex color picker */}
        <div
          className="relative w-5 h-5 rounded-full overflow-hidden border-2 border-transparent hover:border-gray-300 transition cursor-pointer shrink-0"
          title="Custom color"
        >
          <input
            type="color"
            value={form.color}
            onChange={(e) => onChange({ ...form, color: e.target.value })}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
          <div
            className="w-full h-full rounded-full flex items-center justify-center text-[8px] font-bold"
            style={{
              background: `conic-gradient(#ff6b9d, #f7ca1d, #3ff37d, #6366f1, #ef4444, #ff6b9d)`,
            }}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onSubmit}
          disabled={!!dateError}
          className="flex-1 bg-black text-white py-1 rounded text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition"
        >
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 border border-gray-200 py-1 rounded text-xs hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
