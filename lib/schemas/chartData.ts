import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const ChartDataSchema = z.object({
  tasks: z.array(TaskSchema),
});

export type ValidatedChartData = z.infer<typeof ChartDataSchema>;

/**
 * Parses raw DB chart_data through the schema.
 * Returns { tasks: [] } if data is missing or invalid — prevents crashes from corrupt DB values.
 */
export function parseChartData(raw: unknown): ValidatedChartData {
  const result = ChartDataSchema.safeParse(raw);
  return result.success ? result.data : { tasks: [] };
}
