'use client';

import { useRef, useState, useEffect } from 'react';
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
import { useGanttStore, ZoomLevel, Task, TaskBar } from '@/lib/stores/ganttStore';

// Overlap check: do two closed intervals [aS,aE] and [bS,bE] intersect?
function barsOverlap(aS: Date, aE: Date, bS: Date, bE: Date): boolean {
  return aS <= bE && bS <= aE;
}

// ---------------------------------------------------------------------------
// Zoom config
// ---------------------------------------------------------------------------
const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number }> = {
  day:   { dayWidth: 32 },
  week:  { dayWidth: 8  },
  month: { dayWidth: 3  },
};

const HEADER_H = 56;
const ROW_H    = 44;
const HANDLE_W = 8;

// ---------------------------------------------------------------------------
// Drag model
// ---------------------------------------------------------------------------
interface BarDrag {
  kind: 'bar-move' | 'bar-resize-left' | 'bar-resize-right';
  taskId: string;
  barId: string;
  startClientX: number;
  startClientY: number;
  origStart: string;
  origEnd: string;
  deltaDays: number;
}

interface CreateDrag {
  kind: 'create';
  taskId: string;
  startClientX: number;
  anchorDate: string; // YYYY-MM-DD where pointer went down
  deltaDays: number;
}

type ActiveDrag = BarDrag | CreateDrag;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Timeline() {
  const { tasks, zoom, collaboratorRole, addBar, updateBar, deleteBar, setPendingNewTaskDates, pendingPhantomBar, setPendingPhantomBar } = useGanttStore();
  const canEdit = collaboratorRole === 'owner' || collaboratorRole === 'editor';
  const { dayWidth } = ZOOM_CONFIG[zoom];

  const dragRef  = useRef<ActiveDrag | null>(null);
  const [dragTick, setDragTick] = useState(0); // increment → re-render for live preview

  // Popup state
  const [popup, setPopup] = useState<{ task: Task; bar: TaskBar; x: number; y: number } | null>(null);
  // HTML5 drop indicator (sidebar drag)
  const [dropIndicator, setDropIndicator] = useState<{ date: string; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track container width to extend the timeline to fill the screen (fix #8)
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Scroll-sync with TaskSidebar via custom events (fix #7)
  const isSyncingScrollRef = useRef(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const { scrollTop, source } = (e as CustomEvent<{ scrollTop: number; source: string }>).detail;
      if (source === 'sidebar' && containerRef.current && !isSyncingScrollRef.current) {
        isSyncingScrollRef.current = true;
        containerRef.current.scrollTop = scrollTop;
        requestAnimationFrame(() => { isSyncingScrollRef.current = false; });
      }
    };
    window.addEventListener('gantt:scrollY', handler);
    return () => window.removeEventListener('gantt:scrollY', handler);
  }, []);

  // --- Date range ---
  const LEAD_DAYS   = zoom === 'day' ?  2 : zoom === 'week' ?  7 :  30;
  const TRAIL_DAYS  = zoom === 'day' ? 21 : zoom === 'week' ? 42 :  90;
  const TRAIL_EMPTY = zoom === 'day' ? 90 : zoom === 'week' ? 180 : 365;

  let minDate: Date;
  let maxDate: Date;

  const allBars = tasks.flatMap((t) => t.bars);

  if (allBars.length === 0) {
    minDate = subDays(new Date(), LEAD_DAYS);
    maxDate = addDays(new Date(), TRAIL_EMPTY);
  } else {
    const times = allBars.flatMap((b) => [parseISO(b.startDate).getTime(), parseISO(b.endDate).getTime()]);
    minDate = subDays(new Date(Math.min(...times)), LEAD_DAYS);
    maxDate = addDays(new Date(Math.max(...times)), TRAIL_DAYS);
  }

  // Extend maxDate so the timeline always fills the visible container (fix #8)
  if (containerWidth > 0) {
    const neededDays = Math.ceil(containerWidth / dayWidth);
    const currentDays = differenceInCalendarDays(maxDate, minDate) + 1;
    if (currentDays < neededDays) {
      maxDate = addDays(minDate, neededDays - 1);
    }
  }

  const days        = eachDayOfInterval({ start: minDate, end: maxDate });
  const totalW      = days.length * dayWidth;
  // +1 extra row so grid extends into the phantom "Add a task..." row
  const gridRows    = tasks.length + 1;
  const totalH      = HEADER_H + gridRows * ROW_H;
  const todayOffset = differenceInCalendarDays(new Date(), minDate) * dayWidth;

  const dateToX = (d: Date) => differenceInCalendarDays(d, minDate) * dayWidth;

  const xToDate = (clientX: number): Date => {
    if (!containerRef.current) return minDate;
    const rect = containerRef.current.getBoundingClientRect();
    const x    = clientX - rect.left + containerRef.current.scrollLeft;
    return addDays(minDate, Math.max(0, Math.floor(x / dayWidth)));
  };

  // ---- Shared pointer move / up (used by every draggable element) ----
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.startClientX) / dayWidth);
    if (delta !== d.deltaDays) {
      d.deltaDays = delta;
      setDragTick((n) => n + 1);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragTick((n) => n + 1);

    if (d.kind === 'create') {
      const anchor = parseISO(d.anchorDate);
      const s  = addDays(anchor, Math.min(0, d.deltaDays));
      const en = addDays(anchor, Math.max(0, d.deltaDays));
      // Find overlapping bars and merge them into one
      const existingBars = tasks.find((t) => t.id === d.taskId)?.bars ?? [];
      const hitting = existingBars.filter((b) =>
        barsOverlap(s, en, parseISO(b.startDate), parseISO(b.endDate))
      );
      let mergedStart = s, mergedEnd = en;
      for (const b of hitting) {
        if (parseISO(b.startDate) < mergedStart) mergedStart = parseISO(b.startDate);
        if (parseISO(b.endDate)   > mergedEnd)   mergedEnd   = parseISO(b.endDate);
        deleteBar(d.taskId, b.id);
      }
      addBar(d.taskId, {
        id: crypto.randomUUID(),
        startDate: format(mergedStart, 'yyyy-MM-dd'),
        endDate:   format(mergedEnd,   'yyyy-MM-dd'),
      });
      return;
    }

    // Click with no movement → open popup
    if (d.deltaDays === 0) {
      if (d.kind === 'bar-move') {
        const task = tasks.find((t) => t.id === d.taskId);
        const bd   = d as BarDrag;
        const bar  = task?.bars.find((b) => b.id === bd.barId);
        if (task && bar) {
          const rect = containerRef.current?.getBoundingClientRect();
          setPopup({
            task, bar,
            x: bd.startClientX - (rect?.left ?? 0),
            y: bd.startClientY - (rect?.top  ?? 0),
          });
        }
      }
      return;
    }

    const oS = parseISO(d.origStart);
    const oE = parseISO(d.origEnd);
    let ns = oS, ne = oE;

    if (d.kind === 'bar-move') {
      ns = addDays(oS, d.deltaDays);
      ne = addDays(oE, d.deltaDays);
    } else if (d.kind === 'bar-resize-left') {
      const c = addDays(oS, d.deltaDays);
      ns = differenceInCalendarDays(oE, c) >= 0 ? c : oE;
      ne = oE;
    } else {
      const c = addDays(oE, d.deltaDays);
      ns = oS;
      ne = differenceInCalendarDays(c, oS) >= 0 ? c : oS;
    }

    // Merge with any bars the moved/resized bar now touches
    const bd2    = d as BarDrag;
    const others = tasks.find((t) => t.id === d.taskId)?.bars.filter((b) => b.id !== bd2.barId) ?? [];
    const hitting = others.filter((b) => barsOverlap(ns, ne, parseISO(b.startDate), parseISO(b.endDate)));
    let mergedStart = ns, mergedEnd = ne;
    for (const b of hitting) {
      if (parseISO(b.startDate) < mergedStart) mergedStart = parseISO(b.startDate);
      if (parseISO(b.endDate)   > mergedEnd)   mergedEnd   = parseISO(b.endDate);
      deleteBar(d.taskId, b.id);
    }

    updateBar(d.taskId, d.barId, {
      startDate: format(mergedStart, 'yyyy-MM-dd'),
      endDate:   format(mergedEnd,   'yyyy-MM-dd'),
    });
  };

  // ---- Bar body pointer down (move) ----
  const onBarPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    taskId: string, barId: string,
    s: string, en: string,
  ) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'bar-move', taskId, barId, startClientX: e.clientX, startClientY: e.clientY, origStart: s, origEnd: en, deltaDays: 0 };
    setDragTick((n) => n + 1);
  };

  // ---- Resize handle pointer down ----
  const onHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    taskId: string, barId: string,
    side: 'left' | 'right',
    s: string, en: string,
  ) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: side === 'left' ? 'bar-resize-left' : 'bar-resize-right',
      taskId, barId, startClientX: e.clientX, startClientY: e.clientY, origStart: s, origEnd: en, deltaDays: 0,
    };
    setDragTick((n) => n + 1);
  };

  // ---- Row background pointer down (create bar) ----
  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>, taskId: string) => {
    if (!canEdit) return;
    if ((e.target as Element).closest('[data-bar]')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'create', taskId,
      startClientX: e.clientX,
      anchorDate: format(xToDate(e.clientX), 'yyyy-MM-dd'),
      deltaDays: 0,
    };
    setDragTick((n) => n + 1);
  };

  // ---- Bar geometry (with live drag preview) ----
  const getBarGeometry = (taskId: string, barId: string, startDate: string, endDate: string) => {
    let s = parseISO(startDate);
    let e = parseISO(endDate);
    const d = dragRef.current;

    if (d && d.taskId === taskId && d.kind !== 'create' && (d as BarDrag).barId === barId) {
      const bd = d as BarDrag;
      const oS = parseISO(bd.origStart);
      const oE = parseISO(bd.origEnd);
      if (bd.kind === 'bar-move') {
        s = addDays(oS, bd.deltaDays);
        e = addDays(oE, bd.deltaDays);
      } else if (bd.kind === 'bar-resize-left') {
        const c = addDays(oS, bd.deltaDays);
        s = differenceInCalendarDays(oE, c) >= 0 ? c : oE;
        e = oE;
      } else {
        const c = addDays(oE, bd.deltaDays);
        s = oS;
        e = differenceInCalendarDays(c, oS) >= 0 ? c : oS;
      }
    }

    const left  = dateToX(s);
    const width = Math.max(dayWidth, (differenceInCalendarDays(e, s) + 1) * dayWidth);
    return { left, width };
  };

  // ---- Create preview geometry ----
  const getCreatePreview = (taskId: string) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'create' || d.taskId !== taskId) return null;
    const anchor = parseISO(d.anchorDate);
    const s  = addDays(anchor, Math.min(0, d.deltaDays));
    const en = addDays(anchor, Math.max(0, d.deltaDays));
    return {
      left:  dateToX(s),
      width: Math.max(dayWidth, (differenceInCalendarDays(en, s) + 1) * dayWidth),
    };
  };

  // ---- HTML5 sidebar drag handlers ----
  const onTimelineDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const dropDate = xToDate(e.clientX);
    setDropIndicator({ date: format(dropDate, 'yyyy-MM-dd'), x: differenceInCalendarDays(dropDate, minDate) * dayWidth });
  };

  const onTimelineDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) setDropIndicator(null);
  };

  const onTimelineDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId   = e.dataTransfer.getData('text/plain');
    const dropDate = xToDate(e.clientX);
    const task     = tasks.find((t) => t.id === taskId);
    if (task) {
      const duration = task.bars.length > 0
        ? differenceInCalendarDays(parseISO(task.bars[0].endDate), parseISO(task.bars[0].startDate))
        : 6;
      const newStart = dropDate;
      const newEnd   = addDays(dropDate, duration);
      const hitting  = task.bars.filter((b) =>
        barsOverlap(newStart, newEnd, parseISO(b.startDate), parseISO(b.endDate))
      );
      let mergedStart = newStart, mergedEnd = newEnd;
      for (const b of hitting) {
        if (parseISO(b.startDate) < mergedStart) mergedStart = parseISO(b.startDate);
        if (parseISO(b.endDate)   > mergedEnd)   mergedEnd   = parseISO(b.endDate);
        deleteBar(taskId, b.id);
      }
      addBar(taskId, {
        id: crypto.randomUUID(),
        startDate: format(mergedStart, 'yyyy-MM-dd'),
        endDate:   format(mergedEnd,   'yyyy-MM-dd'),
      });
    }
    setDropIndicator(null);
  };

  // ---------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative"
      onClick={() => { setPopup(null); }}
      onScroll={(e) => {
        if (isSyncingScrollRef.current) return;
        isSyncingScrollRef.current = true;
        window.dispatchEvent(new CustomEvent('gantt:scrollY', { detail: { scrollTop: e.currentTarget.scrollTop, source: 'timeline' } }));
        requestAnimationFrame(() => { isSyncingScrollRef.current = false; });
      }}
      onDragOver={onTimelineDragOver}
      onDragLeave={onTimelineDragLeave}
      onDrop={onTimelineDrop}
    >
      <div style={{ width: totalW, minHeight: totalH, position: 'relative' }}>

        {/* ---- Date header ---- */}
        <div
          style={{ height: HEADER_H, width: totalW }}
          className="sticky top-0 z-10 bg-white border-b border-gray-200"
        >
          {zoom === 'day'   && <DayHeader   days={days} dayWidth={dayWidth} />}
          {zoom === 'week'  && <WeekHeader  days={days} dayWidth={dayWidth} minDate={minDate} />}
          {zoom === 'month' && <MonthHeader days={days} dayWidth={dayWidth} minDate={minDate} />}
        </div>

        {/* ---- Column grid lines (+1 phantom row) ---- */}
        <div
          style={{ position: 'absolute', top: HEADER_H, left: 0, width: totalW, height: gridRows * ROW_H }}
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

        {/* ---- HTML5 drop indicator ---- */}
        {dropIndicator && (
          <div
            style={{
              position: 'absolute', top: 0, left: dropIndicator.x + dayWidth / 2 - 1,
              width: 2, height: totalH, pointerEvents: 'none', zIndex: 50,
            }}
            className="bg-blue-500"
          >
            <div className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap shadow">
              {dropIndicator.date}
            </div>
          </div>
        )}

        {/* ---- Today indicator ---- */}
        {todayOffset >= 0 && todayOffset <= totalW && (
          <div
            style={{
              position: 'absolute', top: HEADER_H, left: todayOffset + dayWidth / 2,
              width: 2, height: gridRows * ROW_H,
            }}
            className="bg-black/20 pointer-events-none"
          />
        )}

        {/* ---- Task rows ---- */}
        {tasks.map((task, rowIndex) => {
          const rowTop  = HEADER_H + rowIndex * ROW_H;
          const preview = getCreatePreview(task.id);

          return (
            <div
              key={task.id}
              style={{ position: 'absolute', top: rowTop, left: 0, width: totalW, height: ROW_H }}
              className={`border-b border-gray-100 ${canEdit ? 'cursor-crosshair' : ''}`}
              onPointerDown={(e) => onRowPointerDown(e, task.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Bars */}
              {task.bars.map((bar) => {
                const { left: barLeft, width: barWidth } = getBarGeometry(task.id, bar.id, bar.startDate, bar.endDate);
                const isThisDragging = dragRef.current?.taskId === task.id
                  && dragRef.current?.kind !== 'create'
                  && (dragRef.current as BarDrag).barId === bar.id;

                return (
                  <div
                    key={bar.id}
                    data-bar="true"
                    style={{
                      position: 'absolute',
                      left: barLeft, width: barWidth, height: 28, top: 8,
                      backgroundColor: task.color,
                      borderRadius: 6,
                      opacity: isThisDragging ? 1 : 0.9,
                      zIndex: 1,
                    }}
                    className={`flex items-center overflow-hidden transition-opacity hover:opacity-100 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => onBarPointerDown(e, task.id, bar.id, bar.startDate, bar.endDate)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    {/* Left resize handle */}
                    {canEdit && (
                      <div
                        style={{ width: HANDLE_W, height: '100%', cursor: 'ew-resize', flexShrink: 0 }}
                        className="flex items-center justify-center group/handle hover:bg-black/10 rounded-l-[6px]"
                        onPointerDown={(e) => onHandlePointerDown(e, task.id, bar.id, 'left', bar.startDate, bar.endDate)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                      >
                        <span className="opacity-0 group-hover/handle:opacity-60 text-[8px] leading-none select-none"
                          style={{ color: isLightColor(task.color) ? '#000' : '#fff' }}>◂</span>
                      </div>
                    )}

                    {/* Label */}
                    <span
                      className="flex-1 text-xs font-medium truncate px-1 select-none cursor-pointer"
                      style={{ color: isLightColor(task.color) ? '#000000' : '#ffffff' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = containerRef.current?.getBoundingClientRect();
                        setPopup({ task, bar, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
                      }}
                    >
                      {task.name}
                    </span>

                    {/* Right resize handle */}
                    {canEdit && (
                      <div
                        style={{ width: HANDLE_W, height: '100%', cursor: 'ew-resize', flexShrink: 0 }}
                        className="flex items-center justify-center group/handle hover:bg-black/10 rounded-r-[6px]"
                        onPointerDown={(e) => onHandlePointerDown(e, task.id, bar.id, 'right', bar.startDate, bar.endDate)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                      >
                        <span className="opacity-0 group-hover/handle:opacity-60 text-[8px] leading-none select-none"
                          style={{ color: isLightColor(task.color) ? '#000' : '#fff' }}>▸</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Create preview ghost bar — behind real bars */}
              {preview && (
                <div
                  style={{
                    position: 'absolute',
                    left: preview.left, width: preview.width, height: 28, top: 8,
                    backgroundColor: task.color, opacity: 0.35, borderRadius: 6,
                    border: '2px dashed ' + task.color, zIndex: 0,
                  }}
                  className="pointer-events-none"
                />
              )}
            </div>
          );
        })}

        {/* ---- Phantom "Add a task..." row in the timeline ---- */}
        {canEdit && (() => {
          const rowTop = HEADER_H + tasks.length * ROW_H;
          return (
            <div
              key="__phantom__"
              style={{ position: 'absolute', top: rowTop, left: 0, width: totalW, height: ROW_H }}
              className="cursor-crosshair"
              onPointerDown={(e) => {
                if ((e.target as Element).closest('[data-bar]')) return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = {
                  kind: 'create',
                  taskId: '__phantom__',
                  startClientX: e.clientX,
                  anchorDate: format(xToDate(e.clientX), 'yyyy-MM-dd'),
                  deltaDays: 0,
                };
                setDragTick((n) => n + 1);
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => {
                const d = dragRef.current;
                if (!d || d.kind !== 'create' || d.taskId !== '__phantom__') {
                  handlePointerUp(e);
                  return;
                }
                dragRef.current = null;
                setDragTick((n) => n + 1);
                const anchor = parseISO(d.anchorDate);
                const s  = addDays(anchor, Math.min(0, d.deltaDays));
                const en = addDays(anchor, Math.max(0, d.deltaDays));
                const sd = format(s,  'yyyy-MM-dd');
                const ed = format(en, 'yyyy-MM-dd');
                setPendingPhantomBar({ startDate: sd, endDate: ed });
                setPendingNewTaskDates({ startDate: sd, endDate: ed });
              }}
            >
              {/* Active drag preview ghost */}
              {getCreatePreview('__phantom__') && (
                <div
                  style={{
                    position: 'absolute',
                    left: getCreatePreview('__phantom__')!.left,
                    width: getCreatePreview('__phantom__')!.width,
                    height: 28, top: 8,
                    backgroundColor: '#94a3b8', opacity: 0.35, borderRadius: 6,
                    border: '2px dashed #94a3b8', zIndex: 0,
                  }}
                  className="pointer-events-none"
                />
              )}
              {/* Persistent ghost while user types name */}
              {pendingPhantomBar && !getCreatePreview('__phantom__') && (() => {
                const left  = dateToX(parseISO(pendingPhantomBar.startDate));
                const width = Math.max(dayWidth, (differenceInCalendarDays(parseISO(pendingPhantomBar.endDate), parseISO(pendingPhantomBar.startDate)) + 1) * dayWidth);
                return (
                  <div
                    style={{
                      position: 'absolute', left, width, height: 28, top: 8,
                      backgroundColor: '#94a3b8', opacity: 0.5, borderRadius: 6,
                      border: '2px dashed #94a3b8', zIndex: 0,
                    }}
                    className="pointer-events-none"
                  />
                );
              })()}
            </div>
          );
        })()}

        {/* Empty state message (no tasks at all) */}
        {tasks.length === 0 && (
          <div
            style={{ top: HEADER_H, left: 0, width: totalW }}
            className="absolute flex items-center justify-center py-16 pointer-events-none"
          >
            <p className="text-gray-300 text-sm">Add tasks from the sidebar to see them here</p>
          </div>
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
              top:  popup.y + 16,
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
              >×</button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Start</span>
                <span className="font-medium text-gray-700">{popup.bar.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">End</span>
                <span className="font-medium text-gray-700">{popup.bar.endDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Duration</span>
                <span className="font-medium text-gray-700">
                  {differenceInCalendarDays(parseISO(popup.bar.endDate), parseISO(popup.bar.startDate)) + 1} days
                </span>
              </div>
              {popup.task.bars.length > 1 && (
                <div className="flex justify-between pt-1 border-t border-gray-100">
                  <span className="text-gray-400">Segments</span>
                  <span className="font-medium text-gray-700">{popup.task.bars.length}</span>
                </div>
              )}
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
                <span className="absolute left-1 top-1 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                  {format(day, 'MMM yyyy')}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Day number row (with single-letter day-of-week above) */}
      <div className="flex" style={{ height: 34 }}>
        {days.map((day, i) => (
          <div
            key={i}
            style={{ width: dayWidth, minWidth: dayWidth }}
            className={`shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${
              isToday(day)
                ? 'font-bold text-white bg-black rounded-full mx-0.5'
                : day.getDay() === 0 || day.getDay() === 6
                ? 'text-gray-300'
                : 'text-gray-400'
            }`}
          >
            <span className="text-[6px] leading-none opacity-60">{format(day, 'EEEEE')}</span>
            <span className="text-[9px] leading-none">{day.getDate()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekHeader({ days, dayWidth, minDate }: { days: Date[]; dayWidth: number; minDate: Date }) {
  const months = eachMonthOfInterval({ start: days[0], end: days[days.length - 1] });
  const weeks  = eachWeekOfInterval({ start: days[0], end: days[days.length - 1] }, { weekStartsOn: 1 });

  return (
    <div className="flex flex-col" style={{ height: HEADER_H }}>
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
              className="text-[10px] font-semibold text-gray-400 whitespace-nowrap overflow-hidden px-1 top-1"
            >
              {format(monthStart, 'MMM yyyy')}
            </span>
          );
        })}
      </div>
      <div className="relative" style={{ height: 34 }}>
        {weeks.map((weekStart) => {
          const left  = differenceInCalendarDays(weekStart, minDate) * dayWidth;
          const width = 7 * dayWidth;
          return (
            <div
              key={weekStart.toISOString()}
              style={{ position: 'absolute', left, width, height: 34 }}
              className="flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-100"
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
            className="flex items-center justify-center text-[10px] font-semibold text-gray-400 border-r border-gray-100 overflow-hidden"
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
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

