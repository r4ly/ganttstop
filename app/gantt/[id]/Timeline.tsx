'use client';

import { useRef, useState } from 'react';
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  differenceInCalendarDays,
  addDays,
  subDays,
  parseISO,
  isToday,
  getISOWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { useGanttStore, ZoomLevel, Task } from '@/lib/stores/ganttStore';

// ---------------------------------------------------------------------------
// Zoom configuration — dayWidth controls how many px each calendar day takes
// ---------------------------------------------------------------------------
const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number }> = {
  day:   { dayWidth: 32 },
  week:  { dayWidth: 8  },
  month: { dayWidth: 3  },
};

const HEADER_H = 56;  // px for the two-row date header
const ROW_H    = 44;  // px per task row
const HANDLE_W = 8;   // px for the left/right resize handle

// ---------------------------------------------------------------------------
// Drag state for resize handles
// ---------------------------------------------------------------------------
interface DragState {
  taskId: string;
  side: 'left' | 'right';
  startClientX: number;
  originalStartDate: string;
  originalEndDate: string;
  /** live delta in DAYS (can be negative) */
  deltaDays: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Timeline() {
  const { tasks, zoom, updateTask } = useGanttStore();
  const { dayWidth } = ZOOM_CONFIG[zoom];

  const dragRef = useRef<DragState | null>(null);
  // We store deltaDays in state so the bar preview re-renders while dragging
  const [dragDelta, setDragDelta] = useState<{ taskId: string; deltaDays: number } | null>(null);

  // Popup state for task bar click
  const [popup, setPopup] = useState<{ task: Task; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Calculate visible date range ---
  let minDate: Date;
  let maxDate: Date;

  const PAD_DAYS = zoom === 'day' ? 3 : zoom === 'week' ? 14 : 30;

  if (tasks.length === 0) {
    minDate = subDays(new Date(), PAD_DAYS);
    maxDate = addDays(new Date(), PAD_DAYS * 9);
  } else {
    const starts = tasks.map((t) => parseISO(t.startDate));
    const ends   = tasks.map((t) => parseISO(t.endDate));
    minDate = subDays(new Date(Math.min(...starts.map((d) => d.getTime()))), PAD_DAYS);
    maxDate = addDays(new Date(Math.max(...ends.map((d) => d.getTime()))),   PAD_DAYS);
  }

  const days   = eachDayOfInterval({ start: minDate, end: maxDate });
  const totalW = days.length * dayWidth;
  const totalH = HEADER_H + tasks.length * ROW_H;
  const todayOffset = differenceInCalendarDays(new Date(), minDate) * dayWidth;

  // Helper: px position of a date from the left edge
  const dateToX = (d: Date) => differenceInCalendarDays(d, minDate) * dayWidth;

  // --- Pointer-capture drag handlers ---
  const onHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    taskId: string,
    side: 'left' | 'right',
    startDate: string,
    endDate: string,
  ) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      taskId,
      side,
      startClientX: e.clientX,
      originalStartDate: startDate,
      originalEndDate: endDate,
      deltaDays: 0,
    };
    setDragDelta({ taskId, deltaDays: 0 });
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rawDelta = (e.clientX - drag.startClientX) / dayWidth;
    const delta = Math.round(rawDelta);
    if (delta !== drag.deltaDays) {
      drag.deltaDays = delta;
      setDragDelta({ taskId: drag.taskId, deltaDays: delta });
    }
  };

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragDelta(null);

    if (drag.deltaDays === 0) return;

    const origStart = parseISO(drag.originalStartDate);
    const origEnd   = parseISO(drag.originalEndDate);

    let newStart = origStart;
    let newEnd   = origEnd;

    if (drag.side === 'left') {
      newStart = addDays(origStart, drag.deltaDays);
      // Prevent collapsing below 1 day
      if (differenceInCalendarDays(newEnd, newStart) < 0) newStart = newEnd;
    } else {
      newEnd = addDays(origEnd, drag.deltaDays);
      if (differenceInCalendarDays(newEnd, newStart) < 0) newEnd = newStart;
    }

    updateTask(drag.taskId, {
      startDate: format(newStart, 'yyyy-MM-dd'),
      endDate:   format(newEnd,   'yyyy-MM-dd'),
    });
  };

  // Compute bar geometry including live drag preview
  const getBarGeometry = (taskId: string, startDate: string, endDate: string) => {
    let start = parseISO(startDate);
    let end   = parseISO(endDate);

    if (dragDelta && dragDelta.taskId === taskId && dragRef.current) {
      const { side, deltaDays } = dragRef.current;
      if (side === 'left') {
        const candidate = addDays(start, deltaDays);
        start = differenceInCalendarDays(end, candidate) >= 0 ? candidate : end;
      } else {
        const candidate = addDays(end, deltaDays);
        end = differenceInCalendarDays(candidate, start) >= 0 ? candidate : start;
      }
    }

    const left  = dateToX(start);
    const width = Math.max(dayWidth, (differenceInCalendarDays(end, start) + 1) * dayWidth);
    return { left, width };
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-auto relative" onClick={() => setPopup(null)}>
      <div style={{ width: totalW, minHeight: totalH, position: 'relative' }}>

        {/* ---- Date header ---- */}
        <div
          style={{ height: HEADER_H, width: totalW }}
          className="sticky top-0 z-10 bg-white border-b border-gray-200"
        >
          {zoom === 'day'   && <DayHeader days={days} dayWidth={dayWidth} />}
          {zoom === 'week'  && <WeekHeader days={days} dayWidth={dayWidth} minDate={minDate} />}
          {zoom === 'month' && <MonthHeader days={days} dayWidth={dayWidth} minDate={minDate} />}
        </div>

        {/* ---- Column grid lines ---- */}
        <div
          style={{ position: 'absolute', top: HEADER_H, left: 0, width: totalW, height: tasks.length * ROW_H }}
          className="pointer-events-none"
        >
          {days.map((day, i) => (
            <div
              key={i}
              style={{ position: 'absolute', left: i * dayWidth, top: 0, width: dayWidth, height: '100%' }}
              className={`border-r ${
                zoom === 'day'
                  ? day.getDay() === 1 ? 'border-gray-200' : 'border-gray-100'
                  : 'border-gray-100'
              } ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-gray-50/50' : ''}`}
            />
          ))}
        </div>

        {/* ---- Today indicator ---- */}
        {todayOffset >= 0 && todayOffset <= totalW && (
          <div
            style={{
              position: 'absolute',
              top: HEADER_H,
              left: todayOffset + dayWidth / 2,
              width: 2,
              height: tasks.length * ROW_H,
            }}
            className="bg-black/20 pointer-events-none"
          />
        )}

        {/* ---- Task rows ---- */}
        {tasks.length === 0 ? (
          <div
            style={{ top: HEADER_H, left: 0, width: totalW }}
            className="absolute flex items-center justify-center py-16"
          >
            <p className="text-gray-300 text-sm">Add tasks from the sidebar to see them here</p>
          </div>
        ) : (
          tasks.map((task, rowIndex) => {
            const { left: barLeft, width: barWidth } = getBarGeometry(task.id, task.startDate, task.endDate);
            const rowTop = HEADER_H + rowIndex * ROW_H;
            const isDragging = dragDelta?.taskId === task.id;

            return (
              <div
                key={task.id}
                style={{ position: 'absolute', top: rowTop, left: 0, width: totalW, height: ROW_H }}
                className="border-b border-gray-100 flex items-center"
              >
                {/* ---- Gantt bar ---- */}
                <div
                  style={{
                    position: 'absolute',
                    left: barLeft,
                    width: barWidth,
                    height: 28,
                    backgroundColor: task.color,
                    borderRadius: 6,
                    opacity: isDragging ? 1 : 0.9,
                  }}
                  className="flex items-center overflow-hidden transition-opacity hover:opacity-100"
                  title={`${task.name}: ${task.startDate} → ${task.endDate}`}
                >
                  {/* Left resize handle */}
                  <div
                    style={{ width: HANDLE_W, height: '100%', cursor: 'ew-resize', flexShrink: 0 }}
                    className="flex items-center justify-center group/handle hover:bg-black/10 rounded-l-[6px]"
                    onPointerDown={(e) => onHandlePointerDown(e, task.id, 'left', task.startDate, task.endDate)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                  >
                    <span className="opacity-0 group-hover/handle:opacity-60 text-[8px] leading-none select-none"
                      style={{ color: isLightColor(task.color) ? '#000' : '#fff' }}>
                      ◂
                    </span>
                  </div>

                  {/* Label — click opens popup */}
                  <span
                    className="flex-1 text-xs font-medium truncate px-1 select-none cursor-pointer"
                    style={{ color: isLightColor(task.color) ? '#000000' : '#ffffff' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      setPopup({
                        task,
                        x: e.clientX - (rect?.left ?? 0),
                        y: e.clientY - (rect?.top ?? 0),
                      });
                    }}
                  >
                    {task.name}
                  </span>

                  {/* Right resize handle */}
                  <div
                    style={{ width: HANDLE_W, height: '100%', cursor: 'ew-resize', flexShrink: 0 }}
                    className="flex items-center justify-center group/handle hover:bg-black/10 rounded-r-[6px]"
                    onPointerDown={(e) => onHandlePointerDown(e, task.id, 'right', task.startDate, task.endDate)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                  >
                    <span className="opacity-0 group-hover/handle:opacity-60 text-[8px] leading-none select-none"
                      style={{ color: isLightColor(task.color) ? '#000' : '#fff' }}>
                      ▸
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ---- Task popup ---- */}
      {popup && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: popup.y + 16,
              left: Math.min(popup.x, (rect?.width ?? 500) - 300),
              zIndex: 100,
            }}
            className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-56 text-sm"
          >
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: popup.task.color }} />
                <span className="font-semibold break-words">{popup.task.name}</span>
              </div>
              <button
                onClick={() => setPopup(null)}
                className="text-gray-300 hover:text-gray-600 transition text-lg leading-none shrink-0"
              >
                ×
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Start</span>
                <span className="font-medium text-gray-700">{popup.task.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">End</span>
                <span className="font-medium text-gray-700">{popup.task.endDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Duration</span>
                <span className="font-medium text-gray-700">
                  {differenceInCalendarDays(parseISO(popup.task.endDate), parseISO(popup.task.startDate)) + 1} days
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-headers
// ---------------------------------------------------------------------------

function DayHeader({ days, dayWidth }: { days: Date[]; dayWidth: number }) {
  return (
    <div className="flex flex-col" style={{ height: HEADER_H }}>
      {/* Month row */}
      <div className="flex" style={{ height: 22 }}>
        {days.map((day, i) => {
          const showMonth = i === 0 || day.getDate() === 1;
          return (
            <div key={i} style={{ width: dayWidth, minWidth: dayWidth }} className="shrink-0 relative">
              {showMonth && (
                <span className="absolute left-1 top-1 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {format(day, 'MMM yyyy')}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Day number row */}
      <div className="flex" style={{ height: 34 }}>
        {days.map((day, i) => (
          <div
            key={i}
            style={{ width: dayWidth, minWidth: dayWidth }}
            className={`shrink-0 flex items-center justify-center text-xs border-r border-gray-100 ${
              isToday(day)
                ? 'font-bold text-white bg-black rounded-full mx-0.5'
                : day.getDay() === 0 || day.getDay() === 6
                ? 'text-gray-300'
                : 'text-gray-500'
            }`}
          >
            {day.getDate()}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekHeader({ days, dayWidth, minDate }: { days: Date[]; dayWidth: number; minDate: Date }) {
  // Group days into months for top row
  const months = eachMonthOfInterval({ start: days[0], end: days[days.length - 1] });
  // Week start dates in range
  const weeks = eachWeekOfInterval({ start: days[0], end: days[days.length - 1] }, { weekStartsOn: 1 });

  return (
    <div className="flex flex-col" style={{ height: HEADER_H }}>
      {/* Month row */}
      <div className="relative" style={{ height: 22 }}>
        {months.map((monthStart) => {
          const start = monthStart < days[0] ? days[0] : monthStart;
          const end   = endOfMonth(monthStart) > days[days.length - 1] ? days[days.length - 1] : endOfMonth(monthStart);
          const left  = differenceInCalendarDays(start, minDate) * dayWidth;
          const width = (differenceInCalendarDays(end, start) + 1) * dayWidth;
          return (
            <span
              key={monthStart.toISOString()}
              style={{ position: 'absolute', left, width }}
              className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden px-1 top-1"
            >
              {format(monthStart, 'MMM yyyy')}
            </span>
          );
        })}
      </div>
      {/* Week number row */}
      <div className="relative" style={{ height: 34 }}>
        {weeks.map((weekStart) => {
          const left = differenceInCalendarDays(weekStart, minDate) * dayWidth;
          const width = 7 * dayWidth;
          return (
            <div
              key={weekStart.toISOString()}
              style={{ position: 'absolute', left, width, height: 34 }}
              className="flex items-center justify-center text-xs text-gray-500 border-r border-gray-100"
            >
              W{getISOWeek(weekStart)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthHeader({ days, dayWidth, minDate }: { days: Date[]; dayWidth: number; minDate: Date }) {
  const months = eachMonthOfInterval({ start: days[0], end: days[days.length - 1] });

  return (
    <div className="flex" style={{ height: HEADER_H, alignItems: 'center' }}>
      {months.map((monthStart) => {
        const start = monthStart < days[0] ? days[0] : startOfMonth(monthStart);
        const end   = endOfMonth(monthStart) > days[days.length - 1] ? days[days.length - 1] : endOfMonth(monthStart);
        const left  = differenceInCalendarDays(start, minDate) * dayWidth;
        const width = (differenceInCalendarDays(end, start) + 1) * dayWidth;
        return (
          <div
            key={monthStart.toISOString()}
            style={{ position: 'absolute', left, width, height: HEADER_H }}
            className="flex items-center justify-center text-xs font-semibold text-gray-500 border-r border-gray-100 overflow-hidden"
          >
            {format(monthStart, 'MMM yyyy')}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the hex color is light enough to need dark text. */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
