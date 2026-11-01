import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMeetingNotes, createMeetingNote, updateNote, deleteNote } from '@/api/notes';
import { useAuth } from '@/features/auth/AuthContext';
import { formatLocalDate, formatLocalTime } from '@/lib/date';
import { Card, CardHeader, CardTitle, CardEyebrow, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { NoteEditorDialog } from './NoteEditorDialog';
import { useToast } from '@/components/ui/Toast';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  Clock,
  User,
  AlertTriangle,
} from 'lucide-react';

export function NotesSection({ meetingId, userRole, canWriteNotes }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [deletingNote, setDeletingNote] = useState(null);

  // Fetch meeting notes via TanStack Query
  const {
    data: notes = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notes', meetingId],
    queryFn: () => getMeetingNotes(meetingId),
    enabled: Boolean(meetingId),
  });

  // Create Note Mutation
  const createMutation = useMutation({
    mutationFn: (data) => createMeetingNote(meetingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] });
      setIsEditorOpen(false);
      setEditingNote(null);
      toast.success('Meeting note published successfully');
    },
    onError: (err) => {
      if (err.status === 403) {
        toast.error('Permission denied: Only the Note Taker is authorized to create notes.');
      } else {
        toast.error(err.message || 'Failed to create note');
      }
    },
  });

  // Update Note Mutation
  const updateMutation = useMutation({
    mutationFn: ({ noteId, data }) => updateNote(meetingId, noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] });
      setIsEditorOpen(false);
      setEditingNote(null);
      toast.success('Meeting note updated successfully');
    },
    onError: (err) => {
      if (err.status === 403) {
        toast.error('Permission denied: You can only edit your own notes as Note Taker.');
      } else {
        toast.error(err.message || 'Failed to update note');
      }
    },
  });

  // Delete Note Mutation
  const deleteMutation = useMutation({
    mutationFn: (noteId) => deleteNote(meetingId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] });
      setDeletingNote(null);
      toast.success('Meeting note deleted successfully');
    },
    onError: (err) => {
      if (err.status === 403) {
        toast.error('Permission denied: You can only delete your own notes as Note Taker.');
      } else {
        toast.error(err.message || 'Failed to delete note');
      }
    },
  });

  // Toggle Action Item completion — submits backend field names (is_completed)
  const handleToggleActionItem = async (note, actionItemId) => {
    // Only note_taker can manage action items
    if (!canWriteNotes) return;

    const updatedActionItems = (note.action_items || []).map((item) =>
      item.id === actionItemId ? { ...item, is_completed: !item.is_completed } : item
    );

    try {
      await updateNote(meetingId, note.id, { action_items: updatedActionItems });
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] });
    } catch (err) {
      if (err.status === 403) {
        toast.error('Permission denied: Only the Note Taker can modify action items.');
      } else {
        toast.error(err.message || 'Failed to update action item');
      }
    }
  };

  const handleSaveNote = (data) => {
    if (editingNote) {
      updateMutation.mutate({ noteId: editingNote.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-card border-border">
        <CardHeader className="border-b border-border-subtle pb-4">
          <Skeleton className="h-6 w-32 rounded-lg" />
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="shadow-card border-border p-6">
        <ErrorState
          status={error?.status}
          title="Error Loading Notes"
          message={error?.message}
          onRetry={refetch}
          showBackHome={false}
        />
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-border">
      {/* Header */}
      <CardHeader className="border-b border-border-subtle pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardEyebrow>COLLABORATIVE NOTES</CardEyebrow>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-500" />
              <span>Notes ({notes.length})</span>
            </CardTitle>
          </div>

          {/* "New note" button - Note Taker only */}
          {canWriteNotes && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditingNote(null);
                setIsEditorOpen(true);
              }}
            >
              New note
            </Button>
          )}
        </div>
        <p className="text-xs text-content-secondary mt-1">
          {canWriteNotes
            ? 'As Note Taker, you can draft notes, manage action items, and edit or delete your own notes.'
            : 'Read-only view of recorded meeting summaries and action items.'}
        </p>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {notes.length === 0 ? (
          /* Empty state wording differs for note takers vs viewers */
          <EmptyState
            icon={<FileText className="w-8 h-8 text-slate-400" />}
            title="No notes recorded yet"
            description={
              canWriteNotes
                ? "No notes recorded yet. As Note Taker, you can capture discussion takeaways, architecture decisions, and action items using the 'New note' button above."
                : 'No notes have been recorded for this meeting yet. Notes published by the Note Taker will appear here.'
            }
            actionLabel={canWriteNotes ? 'Create first note' : null}
            onAction={
              canWriteNotes
                ? () => {
                    setEditingNote(null);
                    setIsEditorOpen(true);
                  }
                : null
            }
            className="py-8 border-dashed"
          />
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              // isAuthor: backend NoteResponse uses `author_user_id`, not `created_by`
              const isAuthor =
                note.author_user_id === user?.id;
              const canModifyNote = canWriteNotes && isAuthor;

              return (
                <div
                  key={note.id}
                  className="p-5 rounded-2xl bg-surface-app border border-border space-y-3.5 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  {/* Note Title & Author Metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-content-primary">
                        {note.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-content-muted mt-1">
                        <span className="flex items-center gap-1 font-medium text-content-secondary">
                          <User className="w-3.5 h-3.5 text-emerald-500" />
                          {note.author_name || 'Note Taker'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Updated {formatLocalDate(note.updated_at || note.created_at)} at {formatLocalTime(note.updated_at || note.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Edit and Delete buttons for author Note Taker */}
                    {canModifyNote && (
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setEditingNote(note);
                            setIsEditorOpen(true);
                          }}
                          disabled={updateMutation.isPending || deleteMutation.isPending}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => setDeletingNote(note)}
                          disabled={updateMutation.isPending || deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Note Content */}
                  {note.content && (
                    <p className="text-xs sm:text-sm text-content-primary whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>
                  )}

                  {/* Action Items JSONB Checklist */}
                  {note.action_items && note.action_items.length > 0 && (
                    <div className="pt-3 border-t border-border-subtle space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted block">
                        Action Items ({note.action_items.length})
                      </span>
                      <div className="space-y-1.5">
                        {note.action_items.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleToggleActionItem(note, item.id)}
                            className={`flex items-start gap-2.5 p-2 rounded-xl text-xs transition-colors ${
                              canWriteNotes
                                ? 'cursor-pointer hover:bg-surface-subtle'
                                : 'cursor-default'
                            }`}
                          >
                            <button
                              type="button"
                              disabled={!canWriteNotes}
                              className="mt-0.5 text-primary shrink-0 focus:outline-none"
                            >
                              {/* Use backend field: is_completed */}
                              {item.is_completed ? (
                                <CheckSquare className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span
                                className={
                                  item.is_completed
                                    ? 'line-through text-content-muted font-normal'
                                    : 'text-content-primary font-medium'
                                }
                              >
                                {/* Use backend field: description */}
                                {item.description}
                              </span>
                              {/* Use backend field: assignee_email */}
                              {item.assignee_email && (
                                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-surface-subtle text-content-secondary border border-border font-medium inline-block">
                                  Assignee: {item.assignee_email}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Note Editor Modal */}
      <NoteEditorDialog
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingNote(null);
        }}
        initialData={editingNote}
        onSubmit={handleSaveNote}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingNote)}
        onClose={() => setDeletingNote(null)}
        maxWidth="max-w-md"
      >
        <DialogHeader onClose={() => setDeletingNote(null)}>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <span>Delete Meeting Note</span>
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{deletingNote?.title}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeletingNote(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            isLoading={deleteMutation.isPending}
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (deletingNote) {
                deleteMutation.mutate(deletingNote.id);
              }
            }}
          >
            Delete Note
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
