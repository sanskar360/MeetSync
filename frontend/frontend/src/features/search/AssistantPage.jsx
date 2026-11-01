import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchMeetings, getPastMeetings } from '@/api/search';
import { useAuth } from '@/features/auth/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsPersonalAssistant } from '@/hooks/useUserRole';
import { getMyRole, ROLES, ROLE_LABELS } from '@/lib/roles';
import { formatLocalDate, formatLocalTime } from '@/lib/date';
import { Card, CardHeader, CardTitle, CardEyebrow, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  Search,
  Filter,
  Calendar,
  Clock,
  Archive,
  ArrowRight,
  ArrowLeft,
  Users,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Quote,
  X,
  CalendarDays,
} from 'lucide-react';

/**
 * Derives user's meeting role safely with fallbacks
 */
function resolveMeetingRole(meeting, user) {
  if (!meeting) return null;
  if (meeting.user_role) return meeting.user_role;
  if (meeting.role) return meeting.role;
  if (meeting.participants && user) {
    const role = getMyRole(meeting.participants, user);
    if (role) return role;
  }
  if (meeting.created_by === user?.id) return ROLES.AGENDA_OWNER;
  return null;
}

/**
 * Highlights search matches within snippet text
 */
function HighlightSnippet({ text, query }) {
  if (!text) return null;
  if (!query || !query.trim()) {
    return <span className="text-content-secondary text-xs leading-relaxed">{text}</span>;
  }

  const sanitized = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${sanitized})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className="text-content-secondary text-xs leading-relaxed">
      {parts.map((part, index) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark
            key={index}
            className="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-semibold px-0.5 rounded"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export function AssistantPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL query string
  const activeTab = searchParams.get('tab') || 'past'; // Default tab: "Past meetings"
  const urlQuery = searchParams.get('q') || '';
  const urlRole = searchParams.get('role') || '';
  const urlStartDate = searchParams.get('start_date') || '';
  const urlEndDate = searchParams.get('end_date') || '';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 10;

  // Local state for debounced search input
  const [inputText, setInputText] = useState(urlQuery);
  const debouncedQuery = useDebounce(inputText, 350);

  // Sync debounced search input back to URL query string
  useEffect(() => {
    if (debouncedQuery !== urlQuery) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedQuery.trim()) {
          next.set('q', debouncedQuery.trim());
          // When a search query is entered, auto-switch to search tab if currently on past
          if (next.get('tab') !== 'search') {
            next.set('tab', 'search');
          }
        } else {
          next.delete('q');
        }
        next.set('page', '1');
        return next;
      }, { replace: true });
    }
  }, [debouncedQuery, urlQuery, setSearchParams]);

  // Sync external URL changes back to local inputText
  useEffect(() => {
    setInputText(urlQuery);
  }, [urlQuery]);

  // Helper to update URL params
  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || (key === 'page' && value === 1)) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      return next;
    });
  }, [setSearchParams]);

  // Tab switcher
  const handleTabChange = (newTab) => {
    updateParams({ tab: newTab, page: 1 });
  };

  // Filter handlers
  const handleRoleChange = (role) => {
    updateParams({ role, page: 1 });
  };

  const handleStartDateChange = (start_date) => {
    updateParams({ start_date, page: 1 });
  };

  const handleEndDateChange = (end_date) => {
    updateParams({ end_date, page: 1 });
  };

  const handlePageChange = (newPage) => {
    updateParams({ page: newPage });
  };

  const handleResetFilters = () => {
    setInputText('');
    setSearchParams(new URLSearchParams({ tab: 'past' }));
  };

  const { isPersonalAssistant, isLoading: isCheckingRole } = useIsPersonalAssistant();
  const hasActiveFilters = Boolean(urlQuery || urlRole || urlStartDate || urlEndDate);

  // 1. Query for "Search all meetings" tab (GET /api/meetings/search)
  const {
    data: searchData,
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: [
      'meetings',
      'search',
      { q: urlQuery, role: urlRole, start_date: urlStartDate, end_date: urlEndDate, page: urlPage, limit: pageSize },
    ],
    queryFn: () =>
      searchMeetings({
        q: urlQuery,
        role: urlRole,
        start_date: urlStartDate,
        end_date: urlEndDate,
        page: urlPage,
        limit: pageSize,
      }),
    enabled: activeTab === 'search' && isPersonalAssistant,
  });

  // 2. Query for "Past meetings" tab (GET /api/meetings/past)
  const {
    data: rawPastMeetings,
    isLoading: isPastLoading,
    isError: isPastError,
    error: pastError,
    refetch: refetchPast,
  } = useQuery({
    queryKey: ['meetings', 'past'],
    queryFn: () => getPastMeetings(),
    enabled: activeTab === 'past' && isPersonalAssistant,
  });

  // Safely extract list from backend response { results: [...], total: ... }
  const pastItems = useMemo(() => {
    if (!rawPastMeetings) return [];
    if (Array.isArray(rawPastMeetings)) return rawPastMeetings;
    return rawPastMeetings.results || rawPastMeetings.items || [];
  }, [rawPastMeetings]);

  // Filter past meetings if local filters applied
  const filteredPastMeetings = useMemo(() => {
    let list = [...pastItems];

    if (urlRole && user) {
      list = list.filter((m) => {
        const role = resolveMeetingRole(m, user);
        return role === urlRole;
      });
    }

    if (urlStartDate) {
      const start = new Date(urlStartDate);
      list = list.filter((m) => new Date(m.start_time) >= start);
    }

    if (urlEndDate) {
      const end = new Date(urlEndDate);
      list = list.filter((m) => new Date(m.start_time) <= end);
    }

    if (urlQuery) {
      const q = urlQuery.toLowerCase();
      list = list.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q) ||
          (m.matching_snippet || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [pastItems, urlRole, urlStartDate, urlEndDate, urlQuery, user]);

  // Data selection based on active tab
  const isCurrentLoading = activeTab === 'search' ? isSearchLoading : isPastLoading;
  const isCurrentError = activeTab === 'search' ? isSearchError : isPastError;
  const currentError = activeTab === 'search' ? searchError : pastError;
  const currentRefetch = activeTab === 'search' ? refetchSearch : refetchPast;

  const currentResults =
    activeTab === 'search' ? searchData?.results || searchData?.items || [] : filteredPastMeetings;
  const totalCount =
    activeTab === 'search'
      ? (searchData?.total ?? currentResults.length)
      : filteredPastMeetings.length;
  const totalPages =
    activeTab === 'search' ? Math.ceil(totalCount / pageSize) || 1 : 1;

  // Authority Enforcement: Accessible strictly to Personal Assistants per docs/meeting_roles_and_authorities.md
  if (!isCheckingRole && !isPersonalAssistant) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          status={403}
          title="Access Restricted"
          message="According to the workspace authority policy, cross-meeting search and the Personal Assistant archive are accessible exclusively to designated Personal Assistants."
          showBackHome={true}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header with back-to-dashboard link (no navbar) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-subtle px-2.5 py-1 rounded-lg border border-border transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </button>

            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Personal Assistant
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-content-primary">
            Search & Meeting Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-content-secondary mt-1">
            Query past transcripts, meeting agendas, and collaborative notes across all participant roles.
          </p>
        </div>

        {/* Quick Dashboard Action */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/')}
            leftIcon={<CalendarDays className="w-4 h-4 text-primary" />}
          >
            Calendar View
          </Button>
        </div>
      </div>

      {/* Tabs Navigation: Default "Past meetings" + "Search all meetings" */}
      <div className="flex items-center justify-between border-b border-border gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 pb-px">
          <button
            type="button"
            onClick={() => handleTabChange('past')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'past'
                ? 'border-primary text-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-border'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>Past Meetings</span>
            {!isPastLoading && (
              <span
                className={`text-[11px] px-2 py-0.2 rounded-full font-semibold ${
                  activeTab === 'past'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-subtle text-content-muted'
                }`}
              >
                {pastItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('search')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'search'
                ? 'border-primary text-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-border'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search All Meetings</span>
            {activeTab === 'search' && !isSearchLoading && (
              <span className="text-[11px] px-2 py-0.2 rounded-full font-semibold bg-primary/10 text-primary">
                {totalCount}
              </span>
            )}
          </button>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 mb-2 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all filters
          </button>
        )}
      </div>

      {/* Search and Filters Card */}
      <Card className="p-5 sm:p-6 shadow-card space-y-4 border-border">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4">
          {/* Search bar (q) with debounce */}
          <div className="sm:col-span-12 lg:col-span-5">
            <div className="relative">
              <Input
                label="Search Keyword"
                placeholder="Search transcripts, notes, action items, topics..."
                leftIcon={<Search className="w-4 h-4 text-content-muted" />}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              {inputText && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  aria-label="Clear search input"
                  className="absolute right-3 top-[34px] p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Role Filter */}
          <div className="sm:col-span-4 lg:col-span-3">
            <Select
              label="Participant Role"
              value={urlRole}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              <option value="">All Participant Roles</option>
              <option value={ROLES.AGENDA_OWNER}>Agenda Owner</option>
              <option value={ROLES.NOTE_TAKER}>Note Taker</option>
              <option value={ROLES.PERSONAL_ASSISTANT}>Personal Assistant</option>
              <option value={ROLES.PARTICIPANT}>Participant</option>
            </Select>
          </div>

          {/* Date range: Start Date */}
          <div className="sm:col-span-4 lg:col-span-2">
            <Input
              label="From Date"
              type="date"
              value={urlStartDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
            />
          </div>

          {/* Date range: End Date */}
          <div className="sm:col-span-4 lg:col-span-2">
            <Input
              label="To Date"
              type="date"
              value={urlEndDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
            />
          </div>
        </div>

        {/* Quick Role Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
          <span className="text-[11px] font-semibold text-content-muted mr-1">Quick Role:</span>
          {[
            { label: 'All Roles', value: '' },
            { label: 'Agenda Owner', value: ROLES.AGENDA_OWNER },
            { label: 'Note Taker', value: ROLES.NOTE_TAKER },
            { label: 'Personal Assistant', value: ROLES.PERSONAL_ASSISTANT },
            { label: 'Participant', value: ROLES.PARTICIPANT },
          ].map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => handleRoleChange(pill.value)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                urlRole === pill.value
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-subtle hover:bg-surface-subtle/80 text-content-secondary border border-border/80'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Results Header with Count & Pagination */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-content-primary flex items-center gap-2">
            <span>
              {activeTab === 'past' ? 'Completed Past Meetings' : 'Search Results'}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-content-secondary border border-border">
              {totalCount} {totalCount === 1 ? 'meeting' : 'meetings'}
            </span>
          </h2>
          {urlQuery && (
            <p className="text-xs text-content-muted mt-0.5">
              Showing matching entries for query &ldquo;<span className="text-content-primary font-medium">{urlQuery}</span>&rdquo;
            </p>
          )}
        </div>

        {/* Pagination Controls (when more than 1 page exists) */}
        {activeTab === 'search' && totalPages > 1 && (
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-content-muted">
              Page {urlPage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={urlPage <= 1}
              onClick={() => handlePageChange(Math.max(1, urlPage - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={urlPage >= totalPages}
              onClick={() => handlePageChange(Math.min(totalPages, urlPage + 1))}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Results Area */}
      {isCurrentLoading ? (
        <SkeletonList count={4} />
      ) : isCurrentError ? (
        <ErrorState
          status={currentError?.status || 500}
          title="Failed to Load Meetings"
          message={currentError?.message || 'A network error occurred while querying meetings.'}
          onRetry={currentRefetch}
        />
      ) : currentResults.length === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8 text-slate-400" />}
          title={
            urlQuery
              ? `No meetings match "${urlQuery}"`
              : activeTab === 'past'
              ? 'No past meetings recorded'
              : 'No meetings found'
          }
          description="Try broadening your search keywords, adjusting the date filters, or switching role selection."
          action={
            hasActiveFilters && (
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {currentResults.map((meeting) => {
            const meetingId = meeting.meeting_id || meeting.id;
            const myRole = resolveMeetingRole(meeting, user);
            const snippet =
              meeting.snippets?.[0] ||
              meeting.matching_snippet ||
              meeting.snippet ||
              meeting.description ||
              'Meeting agenda and discussion topics recorded in workspace.';

            return (
              <div
                key={meetingId}
                onClick={() => navigate(`/meetings/${meetingId}`)}
                className="p-5 rounded-2xl bg-surface-card border border-border hover:border-primary/40 hover:shadow-card transition-all duration-150 cursor-pointer flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-2.5">
                  {/* Top Row: Title + Role Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <h3 className="text-base sm:text-lg font-bold text-content-primary group-hover:text-primary transition-colors flex items-center gap-2">
                      <span>{meeting.title}</span>
                    </h3>

                    {/* Role badge for current user */}
                    <div className="flex items-center gap-2">
                      {myRole ? (
                        <Badge role={myRole} size="sm" />
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          External
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Matching Snippet Quote Block */}
                  <div className="p-3 rounded-xl bg-surface-subtle/70 border border-border-subtle flex items-start gap-2.5">
                    <Quote className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5 opacity-80" />
                    <div className="flex-1">
                      <HighlightSnippet text={snippet} query={urlQuery} />
                    </div>
                  </div>

                  {/* Metadata line: Date, Time, Participants / Search Matches */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-content-muted pt-1">
                    <span className="flex items-center gap-1.5 font-medium text-content-secondary">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {formatLocalDate(meeting.start_time, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-content-muted" />
                      {formatLocalTime(meeting.start_time)} – {formatLocalTime(meeting.end_time)}
                    </span>
                    {meeting.matching_notes_count !== undefined ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1.5 font-medium text-primary">
                          <Search className="w-3.5 h-3.5" />
                          {(meeting.matching_notes_count || 0) + (meeting.matching_transcripts_count || 0)} search matches
                        </span>
                      </>
                    ) : (meeting.participants?.length || meeting.participants_count) ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-content-muted" />
                          {meeting.participants?.length || meeting.participants_count || 0} participants
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-end pt-1 border-t border-border-subtle/60">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform">
                    <span>Open meeting details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
