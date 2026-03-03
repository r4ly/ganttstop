import { z } from 'zod';

const TaskBarSchema = z.object({
  id: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Accepts both old format (task.startDate / task.endDate) and new format (task.bars[])
const RawTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bars: z.array(TaskBarSchema).optional(),
});

const RawChartDataSchema = z.object({
  tasks: z.array(RawTaskSchema),
});

export interface TaskBarData {
  id: string;
  startDate: string;
  endDate: string;
}

export interface ValidatedTaskData {
  id: string;
  name: string;
  color: string;
  bars: TaskBarData[];
}

export interface ValidatedChartData {
  tasks: ValidatedTaskData[];
}

/**
 * Parses raw DB chart_data, migrating old (startDate/endDate) tasks to the new
 * multi-bar format (bars array).  Returns { tasks: [] } on invalid data.
 */
export function parseChartData(raw: unknown): ValidatedChartData {
  const result = RawChartDataSchema.safeParse(raw);
  if (!result.success) return { tasks: [] };

  const tasks: ValidatedTaskData[] = result.data.tasks.map((t) => {
    let bars: TaskBarData[] = (t.bars ?? []) as TaskBarData[];
    // Migrate flat startDate/endDate format
    if (bars.length === 0 && t.startDate && t.endDate) {
      bars = [{
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
        startDate: t.startDate,
        endDate:   t.endDate,
      }];
    }
    return { id: t.id, name: t.name, color: t.color, bars };
  });

  return { tasks };
}
