'use client';

import { useState } from 'react';
import { useGanttStore, Task } from '@/lib/stores/ganttStore';

const TASK_COLORS = [
  '#000000',
  '#ff6b9d',
  '#3ff37d',
  '#f7ca1d',
  '#f79e1d',
  '#6366f1',
  '#ef4444',
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
  color: '#000000',
});

export default function TaskSidebar() {
  const { tasks, addTask, updateTask, deleteTask } = useGanttStore();

  // Which task is selected (for editing)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Whether the "add task" form is open
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TaskFormState>(defaultForm);
  // Edit form state (keyed by task id)
  const [editForm, setEditForm] = useState<TaskFormState>(defaultForm);

  const handleSelectTask = (task: Task) => {
    if (selectedId === task.id) {
      setSelectedId(null);
    } else {
      setSelectedId(task.id);
      setEditForm({
        name: task.name,
        startDate: task.startDate,
        endDate: task.endDate,
        color: task.color,
      });
      setAddOpen(false);
    }
  };

  const handleSaveEdit = () => {
    if (!selectedId) return;
    updateTask(selectedId, editForm);
    setSelectedId(null);
  };

  const handleAddTask = () => {
    if (!addForm.name.trim()) return;
    addTask({
      id: crypto.randomUUID(),
      name: addForm.name.trim(),
      startDate: addForm.startDate,
      endDate: addForm.endDate,
      color: addForm.color,
    });
    setAddForm(defaultForm());
    setAddOpen(false);
  };

  const handleDelete = (id: string) => {
    if (selectedId === id) setSelectedId(null);
    deleteTask(id);
  };

  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Tasks</h3>
        <button
          onClick={() => {
            setAddOpen((o) => !o);
            setSelectedId(null);
          }}
          className="text-sm bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition"
        >
          + Add
        </button>
      </div>

      {/* Add task form */}
      {addOpen && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <TaskForm
            form={addForm}
            onChange={setAddForm}
            onSubmit={handleAddTask}
            onCancel={() => setAddOpen(false)}
            submitLabel="Add Task"
          />
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !addOpen && (
          <p className="text-xs text-gray-400 text-center mt-8 px-4">
            No tasks yet. Click "+ Add" to create one.
          </p>
        )}

        {tasks.map((task) => (
          <div key={task.id}>
            {/* Task row */}
            <div
              className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition group ${
                selectedId === task.id ? 'bg-gray-100' : ''
              }`}
              onClick={() => handleSelectTask(task)}
            >
              {/* Color dot */}
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: task.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.name}</p>
                <p className="text-xs text-gray-400">
                  {task.startDate} → {task.endDate}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(task.id);
                }}
                className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 shrink-0"
                title="Delete task"
              >
                ×
              </button>
            </div>

            {/* Inline edit form */}
            {selectedId === task.id && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <TaskForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={handleSaveEdit}
                  onCancel={() => setSelectedId(null)}
                  submitLabel="Save"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
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
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TASK_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ ...form, color: c })}
            className={`w-5 h-5 rounded-full border-2 transition ${
              form.color === c ? 'border-black scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onSubmit}
          className="flex-1 bg-black text-white py-1 rounded text-xs font-semibold hover:bg-gray-800 transition"
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
