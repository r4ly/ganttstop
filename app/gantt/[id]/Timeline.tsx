'use client';

import {
  eachDayOfInterval,
  format,
  differenceInCalendarDays,
  addDays,
  subDays,
  parseISO,
  isToday,
} from 'date-fns';
import { useGanttStore } from '@/lib/stores/ganttStore';

const DAY_WIDTH = 32;   // px per day column
const HEADER_H = 56;    // px for the date header
const ROW_H = 44;       // px per task row

export default function Timeline() {
  const { tasks } = useGanttStore();

  // --- Calculate visible date range ---
  let minDate: Date;
  let maxDate: Date;

  if (tasks.length === 0) {
    minDate = subDays(new Date(), 3);
    maxDate = addDays(new Date(), 27);
  } else {
    const starts = tasks.map((t) => parseISO(t.startDate));
    const ends = tasks.map((t) => parseISO(t.endDate));
    minDate = subDays(
      new Date(Math.min(...starts.map((d) => d.getTime()))),
      3
    );
    maxDate = addDays(
      new Date(Math.max(...ends.map((d) => d.getTime()))),
      3
    );
  }

  const days = eachDayOfInterval({ start: minDate, end: maxDate });
  const totalW = days.length * DAY_WIDTH;
  const totalH = HEADER_H + tasks.length * ROW_H;

  // Today's x-offset
  const todayOffset = differenceInCalendarDays(new Date(), minDate) * DAY_WIDTH;

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Sticky outer wrapper keeps header visible when scrolling vertically */}
      <div style={{ width: totalW, minHeight: totalH, position: 'relative' }}>

        {/* ---- Date header ---- */}
        <div
          style={{ height: HEADER_H, width: totalW }}
          className="sticky top-0 z-10 bg-white border-b border-gray-200 flex flex-col"
        >
          {/* Month row */}
          <div className="flex" style={{ height: 22 }}>
            {days.map((day, i) => {
              const showMonth = i === 0 || day.getDate() === 1;
              return (
                <div
                  key={i}
                  style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                  className="shrink-0 relative"
                >
                  {showMonth && (
                    <span className="absolute left-1 top-1 text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {format(day, 'MMM')}
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
                style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
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

        {/* ---- Column grid lines ---- */}
        <div
          style={{ position: 'absolute', top: HEADER_H, left: 0, width: totalW, height: tasks.length * ROW_H }}
          className="pointer-events-none"
        >
          {days.map((day, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * DAY_WIDTH,
                top: 0,
                width: DAY_WIDTH,
                height: '100%',
              }}
              className={`border-r ${
                day.getDay() === 1 ? 'border-gray-200' : 'border-gray-100'
              } ${
                day.getDay() === 0 || day.getDay() === 6 ? 'bg-gray-50/50' : ''
              }`}
            />
          ))}
        </div>

        {/* ---- Today indicator ---- */}
        {todayOffset >= 0 && todayOffset <= totalW && (
          <div
            style={{
              position: 'absolute',
              top: HEADER_H,
              left: todayOffset + DAY_WIDTH / 2,
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
            const start = parseISO(task.startDate);
            const end = parseISO(task.endDate);
            const barLeft = differenceInCalendarDays(start, minDate) * DAY_WIDTH;
            const barWidth =
              Math.max(1, differenceInCalendarDays(end, start) + 1) * DAY_WIDTH;
            const rowTop = HEADER_H + rowIndex * ROW_H;

            return (
              <div
                key={task.id}
                style={{
                  position: 'absolute',
                  top: rowTop,
                  left: 0,
                  width: totalW,
                  height: ROW_H,
                }}
                className="border-b border-gray-100 flex items-center"
              >
                {/* The Gantt bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: barLeft,
                    width: barWidth,
                    height: 28,
                    backgroundColor: task.color,
                    borderRadius: 6,
                    opacity: 0.9,
                  }}
                  title={`${task.name}: ${task.startDate} → ${task.endDate}`}
                  className="flex items-center px-2 overflow-hidden cursor-default hover:opacity-100 transition"
                >
                  <span
                    className="text-xs font-medium truncate"
                    style={{
                      color: isLightColor(task.color) ? '#000000' : '#ffffff',
                    }}
                  >
                    {task.name}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Determine if a hex color is "light" so we can pick contrasting text */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}
