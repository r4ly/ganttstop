import { create } from 'zustand';

export interface Task {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  color: string;     // hex colour
}

export interface ChartData {
  tasks: Task[];
}

interface GanttState {
  chartId: string | null;
  title: string;
  tasks: Task[];
  isDirty: boolean;

  // Actions
  loadChart: (id: string, title: string, data: ChartData) => void;
  setTitle: (title: string) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  markClean: () => void;
}

export const useGanttStore = create<GanttState>((set) => ({
  chartId: null,
  title: '',
  tasks: [],
  isDirty: false,

  loadChart: (id, title, data) =>
    set({ chartId: id, title, tasks: data.tasks ?? [], isDirty: false }),

  setTitle: (title) => set({ title, isDirty: true }),

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task], isDirty: true })),

  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      isDirty: true,
    })),

  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      isDirty: true,
    })),

  markClean: () => set({ isDirty: false }),
}));
