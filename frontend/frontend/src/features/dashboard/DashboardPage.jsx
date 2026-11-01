import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAllMeetings, syncCalendars } from '@/api/meetings';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useIsNoteTaker } from '@/hooks/useUserRole';
import { getMeetingStatusInfo } from '@/lib/meetingStatus';
import {
  toLocalDateKey,
  isToday,
  formatLocalDate,
  formatLocalTime,
  formatMonthYear,
  groupMeetingsByLocalDate,
  getCalendarGridDays,
} from '@/lib/date';
import { Card, CardHeader, CardTitle, CardEyebrow, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  Search,
  CalendarDays,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

/**
 * Derives the current user's role for a meeting.
 */
function deriveMeetingRole(meeting, currentUser) {
  if (!meeting || !currentUser) return 'participant';

  if (meeting.user_role) return meeting.user_role;
  if (meeting.role) return meeting.role;

  if (Array.isArray(meeting.participants)) {
    const match = meeting.participants.find(
      (p) => p.user_id === currentUser.id || (currentUser.email && p.email?.toLowerCase() === currentUser.email?.toLowerCase())
    );
    if (match?.role) return match.role;
  }

  if (meeting.created_by === currentUser.id) {
    return 'agenda_owner';
  }

  return 'participant';
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isNoteTaker } = useIsNoteTaker();

  // Mutation to synchronize Google Calendar on demand (manual click)
  const syncMutation = useMutation({
    mutationFn: syncCalendars,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      const count = data?.meeting_count ?? 0;
      toast.success(
        count > 0
          ? `Synced ${count} meeting${count === 1 ? '' : 's'} from Google Calendar`
          : 'Calendar is up to date'
      );
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to sync with Google Calendar');
    },
  });

  // Background automatic sync: runs silently once on mount and repeats every 60s
  useEffect(() => {
    let isMounted = true;
    const runAutoSync = async () => {
      try {
        const res = await syncCalendars();
        if (isMounted && res?.meeting_count > 0) {
          queryClient.invalidateQueries({ queryKey: ['meetings'] });
        }
      } catch {
        // Silently swallow background sync errors
      }
    };

    // Run initial auto-sync immediately
    runAutoSync();

    // Set up recurring automatic sync every 60 seconds
    const interval = setInterval(runAutoSync, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [queryClient]);

  // Extract first name for welcome header
  const firstName = useMemo(() => {
    const fullName = user?.name || user?.full_name;
    if (!fullName) return 'there';
    return fullName.trim().split(/\s+/)[0];
  }, [user]);

  // Current calendar view state defaults to today
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Fetch all meetings across pages using TanStack Query
  const {
    data: allMeetings = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['meetings', 'all'],
    queryFn: () => fetchAllMeetings({ limit: 50 }),
  });

  // Timezone-safe grouping of meetings by local date key (YYYY-MM-DD)
  const meetingsByDate = useMemo(() => {
    return groupMeetingsByLocalDate(allMeetings);
  }, [allMeetings]);

  // Generate calendar grid for the visible month
  const gridDays = useMemo(() => {
    return getCalendarGridDays(currentMonth);
  }, [currentMonth]);

  // Count scheduled meetings in the visible month
  const visibleMonthMeetingCount = useMemo(() => {
    const monthIndex = currentMonth.getMonth();
    const year = currentMonth.getFullYear();

    return allMeetings.filter((m) => {
      if (!m.start_time) return false;
      const d = new Date(m.start_time);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).length;
  }, [allMeetings, currentMonth]);

  // Selected date meetings
  const selectedDateKey = toLocalDateKey(selectedDate);
  const selectedDateMeetings = meetingsByDate.get(selectedDateKey) || [];
  const selectedIsToday = isToday(selectedDate);

  // Time-aware meeting comparison: Current local time reference
  const now = useMemo(() => new Date(), [allMeetings]);

  // STRICT REQUIREMENT 1: ONLY meetings that are incoming/upcoming appear here!
  // Compares against current time (start_time > now or in-progress)
  const upcomingMeetings = useMemo(() => {
    return [...allMeetings]
      .filter((m) => {
        if (m.status === 'cancelled') return false;
        const status = getMeetingStatusInfo(m, now);
        return status.isUpcoming;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 5);
  }, [allMeetings, now]);

  // STRICT REQUIREMENT 2: Meetings whose dates/times are expired but never took place
  // Status is distinct from upcoming meetings ("Expired (Did Not Occur)" or "Cancelled")
  const missedMeetings = useMemo(() => {
    return [...allMeetings]
      .filter((m) => {
        const status = getMeetingStatusInfo(m, now);
        return status.isExpired;
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .slice(0, 4);
  }, [allMeetings, now]);

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // Specification: "Click a date with exactly one meeting: navigate to /meetings/:id. With several: select the date and list them in the side panel. Dates without meetings are selectable but do nothing."
  const handleDateClick = (dayDate) => {
    setSelectedDate(dayDate);
    const dateKey = toLocalDateKey(dayDate);
    const dayMeetings = meetingsByDate.get(dateKey) || [];

    if (dayMeetings.length === 1) {
      navigate(`/meetings/${dayMeetings[0].id}`);
    }
  };

  // Keyboard navigation for date cells
  const handleDateKeyDown = (e, dayDate) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleDateClick(dayDate);
    }
  };

  if (isError) {
    return (
      <ErrorState
        status={error?.status}
        message={error?.message || 'Failed to load your meetings calendar.'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Welcome Bar & Button Pair */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border-subtle">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Overview
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-content-primary">
            Welcome back, {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-content-secondary mt-0.5">
            Manage your schedule, role-governed agendas, and collaborative notes.
          </p>
        </div>

        {/* Actions: Sync Calendar & View Switchers */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {/* Sync Calendar Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="rounded-xl font-semibold text-xs flex items-center gap-1.5 shadow-xs border border-border"
            title="Fetch latest meetings directly from Google Calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin text-primary' : 'text-content-secondary'}`} />
            <span>{syncMutation.isPending ? 'Syncing...' : 'Sync Calendar'}</span>
          </Button>

          {/* Button Pair: "Personal Assistant" (visible only to note_takers) & "All Meetings" (active) */}
          <div className="inline-flex p-1 rounded-2xl bg-surface-card border border-border shadow-xs">
            {isNoteTaker && (
              <button
                type="button"
                onClick={() => navigate('/assistant')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-subtle transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-content-muted" />
                <span>Personal Assistant</span>
              </button>
            )}
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-primary text-white shadow-xs flex items-center gap-1.5 cursor-default"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>All Meetings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Calendar Card (8 cols) + Right Column (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Month Calendar Card (8 columns on lg) */}
        <Card className="lg:col-span-8 p-6 shadow-card border-border">
          {/* Calendar Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-content-primary tracking-tight">
                {formatMonthYear(currentMonth)}
              </h2>
              <span className="text-xs font-semibold text-primary">
                {visibleMonthMeetingCount} scheduled meeting{visibleMonthMeetingCount === 1 ? '' : 's'}
              </span>
            </div>

            {/* Navigation Buttons: Today, Prev, Next */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGoToToday}
                className="font-semibold text-xs rounded-xl"
              >
                Today
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="w-8 h-8 p-0 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleNextMonth}
                aria-label="Next month"
                className="w-8 h-8 p-0 rounded-xl"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Weekday Labels (Sun - Sat) */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center" role="row">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <span
                key={day}
                className="text-[11px] font-bold uppercase tracking-wider text-content-muted py-1"
                role="columnheader"
              >
                {day}
              </span>
            ))}
          </div>

          {/* 7x5 or 7x6 Calendar Days Grid */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-20 sm:h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label="Month calendar">
              {gridDays.map((item, index) => {
                const dayMeetings = meetingsByDate.get(item.dateKey) || [];
                const isSelected = item.dateKey === selectedDateKey;
                const isCurrentDayToday = isToday(item.date);
                const hasMeetings = dayMeetings.length > 0;

                return (
                  <div
                    key={index}
                    role="gridcell"
                    tabIndex={0}
                    aria-selected={isSelected}
                    aria-label={`${formatLocalDate(item.date)}, ${dayMeetings.length} meetings`}
                    onClick={() => handleDateClick(item.date)}
                    onKeyDown={(e) => handleDateKeyDown(e, item.date)}
                    className={`relative min-h-[78px] sm:min-h-[96px] p-2 rounded-xl text-left transition-all duration-150 flex flex-col justify-between border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      isSelected
                        ? 'bg-primary-50/80 dark:bg-primary-950/70 border-primary ring-2 ring-primary/20 shadow-xs'
                        : hasMeetings
                        ? 'bg-surface-card hover:bg-surface-subtle border-slate-200 dark:border-slate-800'
                        : 'bg-surface-app/40 hover:bg-surface-subtle border-transparent'
                    } ${!item.isCurrentMonth ? 'opacity-35' : ''}`}
                  >
                    {/* Date Number & Today Highlight Indicator */}
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs sm:text-sm font-bold flex items-center justify-center ${
                          isCurrentDayToday
                            ? 'w-6 h-6 rounded-full bg-primary text-white shadow-xs'
                            : isSelected
                            ? 'text-primary'
                            : item.isCurrentMonth
                            ? 'text-content-primary'
                            : 'text-content-muted'
                        }`}
                      >
                        {item.date.getDate()}
                      </span>

                      {/* Multiple meetings count badge */}
                      {dayMeetings.length > 1 && (
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-extrabold bg-primary text-white shadow-xs">
                          {dayMeetings.length}
                        </span>
                      )}
                    </div>

                    {/* Time pills on dates with meetings (including past dates) */}
                    {hasMeetings ? (
                      <div className="mt-1 space-y-1 w-full overflow-hidden">
                        {dayMeetings.slice(0, 2).map((m) => (
                          <div
                            key={m.id}
                            className="w-full truncate px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center gap-1"
                            title={`${m.title} (${formatLocalTime(m.start_time)})`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span className="font-bold shrink-0">{formatLocalTime(m.start_time)}</span>
                            <span className="truncate opacity-80 font-normal">{m.title}</span>
                          </div>
                        ))}
                        {dayMeetings.length > 2 && (
                          <span className="text-[9px] font-bold text-primary pl-1 block">
                            +{dayMeetings.length - 2} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-4" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* RIGHT COLUMN: 2 Cards (Selected Date Agenda & Upcoming Schedule) */}
        <div className="lg:col-span-4 space-y-5">
          {/* CARD 1: Selected Date Agenda */}
          <Card className="shadow-card border-border">
            <CardHeader className="border-b border-border-subtle pb-3">
              <div className="flex items-center justify-between">
                <CardEyebrow>Selected Date Agenda</CardEyebrow>
                {selectedIsToday && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary-50 dark:bg-primary-950 text-primary border border-primary/20">
                    Today
                  </span>
                )}
              </div>
              <CardTitle className="text-base sm:text-lg">
                {formatLocalDate(selectedDate)}
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              ) : selectedDateMeetings.length === 0 ? (
                /* Empty state as required: "No meetings on this day" */
                <EmptyState
                  icon={<CalendarIcon className="w-6 h-6 text-slate-400" />}
                  title="No meetings on this day"
                  description="There are no discussions or sessions scheduled for this date."
                  className="py-6 border-dashed"
                />
              ) : (
                selectedDateMeetings.map((meeting) => {
                  const role = deriveMeetingRole(meeting, user);
                  const statusInfo = getMeetingStatusInfo(meeting, now);
                  return (
                    <div
                      key={meeting.id}
                      onClick={() => navigate(`/meetings/${meeting.id}`)}
                      className="p-3.5 rounded-xl bg-surface-app hover:bg-surface-subtle border border-border hover:border-primary/40 transition-all cursor-pointer group space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge role={role} size="sm" />
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              statusInfo.variant === 'primary'
                                ? 'bg-primary-50 dark:bg-primary-950/60 text-primary border-primary/20'
                                : statusInfo.variant === 'warning'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-500/20'
                                : statusInfo.variant === 'danger'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-content-muted flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary" />
                          {formatLocalTime(meeting.start_time)}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-content-primary group-hover:text-primary transition-colors leading-snug">
                        {meeting.title}
                      </h4>

                      {meeting.description && (
                        <p className="text-xs text-content-secondary line-clamp-2 leading-relaxed">
                          {meeting.description}
                        </p>
                      )}

                      <div className="pt-1 flex items-center justify-between text-xs text-content-muted border-t border-border-subtle">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {meeting.participants?.length || meeting.participants_count || 0} participants
                        </span>
                        <span className="inline-flex items-center gap-1 text-primary font-semibold group-hover:translate-x-0.5 transition-transform text-xs">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* CARD 2: Upcoming Schedule */}
          <Card className="shadow-card border-border">
            <CardHeader className="border-b border-border-subtle pb-3">
              <CardEyebrow>Incoming Schedule</CardEyebrow>
              <CardTitle className="text-base sm:text-lg">Upcoming Schedule</CardTitle>
              <p className="text-xs text-content-secondary mt-0.5">
                Upcoming meetings compared against current time.
              </p>
            </CardHeader>

            <CardContent className="pt-4 space-y-2.5">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <EmptyState
                  icon={<Clock className="w-6 h-6 text-slate-400" />}
                  title="No upcoming meetings"
                  description="No meetings scheduled in the future compared to current time."
                  className="py-6 border-dashed"
                />
              ) : (
                upcomingMeetings.map((m) => {
                  const role = deriveMeetingRole(m, user);
                  const statusInfo = getMeetingStatusInfo(m, now);
                  const isLive = statusInfo.label === 'In Progress';
                  return (
                    <div
                      key={m.id}
                      onClick={() => navigate(`/meetings/${m.id}`)}
                      className="p-3 rounded-xl bg-surface-app hover:bg-surface-subtle border border-border hover:border-primary/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge role={role} size="sm" />
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                              isLive
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : 'bg-primary-50 dark:bg-primary-950/60 text-primary border-primary/20'
                            }`}
                          >
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                            {statusInfo.label}
                          </span>
                          <span className="text-[11px] font-semibold text-content-muted">
                            {formatLocalDate(m.start_time, { month: 'short', day: 'numeric' })} • {formatLocalTime(m.start_time)}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-content-primary truncate group-hover:text-primary transition-colors">
                          {m.title}
                        </h4>
                      </div>

                      <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  );
                })
              )}

              {/* Missed / Expired Meetings (Did Not Take Place) */}
              {!isLoading && missedMeetings.length > 0 && (
                <>
                  <div className="pt-3 mt-3 border-t border-border-subtle">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          Past / Expired (Did Not Take Place)
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-content-muted">
                        Expired
                      </span>
                    </div>
                    <p className="text-[11px] text-content-muted mb-2">
                      Scheduled date/time has passed with no logged notes or recordings.
                    </p>
                  </div>
                  {missedMeetings.map((m) => {
                    const role = deriveMeetingRole(m, user);
                    const isCancelled = m.status === 'cancelled';
                    return (
                      <div
                        key={m.id}
                        onClick={() => navigate(`/meetings/${m.id}`)}
                        className="p-3 rounded-xl bg-surface-app/50 hover:bg-surface-subtle border border-dashed border-amber-300 dark:border-amber-900/40 hover:border-amber-500 transition-colors cursor-pointer flex items-center justify-between gap-3 group opacity-80 hover:opacity-100"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge role={role} size="sm" />
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                              isCancelled
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            }`}>
                              {isCancelled ? 'Cancelled' : 'Expired (Did Not Occur)'}
                            </span>
                            <span className="text-[11px] font-semibold text-content-muted">
                              {formatLocalDate(m.start_time, { month: 'short', day: 'numeric' })} • {formatLocalTime(m.start_time)}
                            </span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-semibold text-content-secondary truncate group-hover:text-content-primary transition-colors">
                            {m.title}
                          </h4>
                        </div>

                        <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-amber-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
