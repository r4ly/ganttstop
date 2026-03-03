import { create } from 'zustand';

export interface TaskBar {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface Task {
  id: string;
  name: string;
  color: string;     // hex colour
  bars: TaskBar[];   // one entry per distinct date segment
}

export interface ChartData {
  tasks: Task[];
}

export type ZoomLevel = 'day' | 'week' | 'month';
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

interface Snapshot {
  title: string;
  tasks: Task[];
}

const MAX_HISTORY = 100;

interface GanttState {
  chartId: string | null;
  title: string;
  tasks: Task[];
  isDirty: boolean;
  zoom: ZoomLevel;
  collaboratorRole: CollaboratorRole | null;

  // Signal from Timeline → TaskSidebar: open add-form with these dates pre-filled
  pendingNewTaskDates: { startDate: string; endDate: string } | null;
  // Persistent ghost bar in phantom row while user types new task name
  pendingPhantomBar: { startDate: string; endDate: string } | null;

  // Undo/redo stacks
  past: Snapshot[];
  future: Snapshot[];

  // Actions
  loadChart: (id: string, title: string, data: ChartData) => void;
  setTitle: (title: string) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Pick<Task, 'name' | 'color'>>) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (newTasks: Task[]) => void;
  addBar: (taskId: string, bar: TaskBar) => void;
  updateBar: (taskId: string, barId: string, patch: Partial<TaskBar>) => void;
  deleteBar: (taskId: string, barId: string) => void;
  markClean: () => void;
  setZoom: (zoom: ZoomLevel) => void;
  setCollaboratorRole: (role: CollaboratorRole) => void;
  setPendingNewTaskDates: (dates: { startDate: string; endDate: string } | null) => void;
  setPendingPhantomBar: (dates: { startDate: string; endDate: string } | null) => void;
  undo: () => void;
  redo: () => void;
}

/** Push current snapshot to past, clear future, then apply updater */
function withHistory(
  get: () => GanttState,
  updater: (state: GanttState) => Partial<GanttState>,
): Partial<GanttState> {
  const state = get();
  const snapshot: Snapshot = { title: state.title, tasks: state.tasks };
  const past = [...state.past, snapshot].slice(-MAX_HISTORY);
  return { ...updater(state), past, future: [] };
}

export const useGanttStore = create<GanttState>((set, get) => ({
  chartId: null,
  title: '',
  tasks: [],
  isDirty: false,
  zoom: 'day',
  collaboratorRole: null,
  pendingNewTaskDates: null,
  pendingPhantomBar: null,
  past: [],
  future: [],

  loadChart: (id, title, data) =>
    set({ chartId: id, title, tasks: data.tasks ?? [], isDirty: false, collaboratorRole: null, past: [], future: [] }),

  setTitle: (title) =>
    set(withHistory(get, () => ({ title, isDirty: true }))),

  addTask: (task) =>
    set(withHistory(get, (state) => ({ tasks: [...state.tasks, task], isDirty: true }))),

  updateTask: (id, patch) =>
    set(withHistory(get, (state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      isDirty: true,
    }))),

  deleteTask: (id) =>
    set(withHistory(get, (state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      isDirty: true,
    }))),

  reorderTasks: (newTasks) =>
    set(withHistory(get, () => ({ tasks: newTasks, isDirty: true }))),

  addBar: (taskId, bar) =>
    set(withHistory(get, (state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, bars: [...t.bars, bar] } : t,
      ),
      isDirty: true,
    }))),

  updateBar: (taskId, barId, patch) =>
    set(withHistory(get, (state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, bars: t.bars.map((b) => (b.id === barId ? { ...b, ...patch } : b)) }
          : t,
      ),
      isDirty: true,
    }))),

  deleteBar: (taskId, barId) =>
    set(withHistory(get, (state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, bars: t.bars.filter((b) => b.id !== barId) } : t,
      ),
      isDirty: true,
    }))),

  markClean: () => set({ isDirty: false }),

  setZoom: (zoom) => set({ zoom }),

  setCollaboratorRole: (role) => set({ collaboratorRole: role }),

  setPendingNewTaskDates: (dates) => set({ pendingNewTaskDates: dates }),

  setPendingPhantomBar: (dates) => set({ pendingPhantomBar: dates }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {};
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      const snapshot: Snapshot = { title: state.title, tasks: state.tasks };
      return {
        title: previous.title,
        tasks: previous.tasks,
        past: newPast,
        future: [snapshot, ...state.future].slice(0, MAX_HISTORY),
        isDirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const snapshot: Snapshot = { title: state.title, tasks: state.tasks };
      return {
        title: next.title,
        tasks: next.tasks,
        past: [...state.past, snapshot].slice(-MAX_HISTORY),
        future: newFuture,
        isDirty: true,
      };
    }),
}));
