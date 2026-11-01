import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { noteFormSchema } from '@/types/note';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';

/**
 * NoteEditorDialog using React Hook Form + Zod
 * Aligned with FastAPI backend schema. Action items are managed as JSONB array.
 */
export function NoteEditorDialog({
  isOpen,
  onClose,
  initialData = null,
  onSubmit,
  isSubmitting = false,
}) {
  const [newActionText, setNewActionText] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: '',
      content: '',
      action_items: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'action_items',
  });

  // Populate form when editing or opening
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          title: initialData.title || '',
          content: initialData.content || '',
          // Normalize backend field names (description, is_completed, assignee_email)
          action_items: (initialData.action_items || []).map((item) => ({
            id: item.id || `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            description: item.description || item.text || '',
            assignee_email: item.assignee_email || item.assignee || '',
            is_completed: Boolean(item.is_completed ?? item.completed),
          })),
        });
      } else {
        reset({
          title: '',
          content: '',
          action_items: [],
        });
      }
      setNewActionText('');
      setNewActionAssignee('');
    }
  }, [isOpen, initialData, reset]);

  const handleAddActionItem = () => {
    if (!newActionText.trim()) return;

    append({
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      description: newActionText.trim(),
      assignee_email: newActionAssignee.trim() || '',
      is_completed: false,
    });

    setNewActionText('');
    setNewActionAssignee('');
  };

  const handleFormSubmit = (data) => {
    onSubmit(data);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogHeader onClose={onClose}>
          <DialogTitle>
            {initialData ? 'Edit Meeting Note' : 'Create Meeting Note'}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? 'Update discussion takeaways and action item assignments.'
              : 'Record meeting decisions, technical details, and follow-up action items.'}
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <Input
            label="Note Title"
            placeholder="e.g. Q4 Platform Deliverables & Architecture"
            error={errors.title?.message}
            {...register('title')}
          />

          {/* Content */}
          <Textarea
            label="Note Content"
            placeholder="Write key discussion points, agreements, or summaries..."
            rows={5}
            error={errors.content?.message}
            {...register('content')}
          />

          {/* Action Items JSONB list */}
          <div className="space-y-3 pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-content-primary">
                Action Items ({fields.length})
              </span>
              <span className="text-[11px] text-content-muted">
                Stored in note JSONB
              </span>
            </div>

            {/* Add action item input row */}
            <div className="space-y-2 p-3 rounded-xl bg-surface-subtle/60 border border-border">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Action item description..."
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddActionItem();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-surface-card text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="text"
                  placeholder="Assignee (e.g. name or email)"
                  value={newActionAssignee}
                  onChange={(e) => setNewActionAssignee(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddActionItem();
                    }
                  }}
                  className="w-full sm:w-44 px-3 py-1.5 rounded-lg border border-border bg-surface-card text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddActionItem}
                  disabled={!newActionText.trim()}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  className="shrink-0"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* List of existing action items */}
            {fields.length > 0 && (
              <div className="space-y-1.5">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-2.5 rounded-xl bg-surface-card border border-border flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          update(index, {
                            ...field,
                            is_completed: !field.is_completed,
                          });
                        }}
                        className="text-primary shrink-0 focus:outline-none"
                      >
                        {field.is_completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <span
                        className={`truncate ${
                          field.is_completed
                            ? 'line-through text-content-muted'
                            : 'text-content-primary font-medium'
                        }`}
                      >
                        {field.description}
                      </span>

                      {field.assignee_email && (
                        <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-surface-subtle text-content-secondary border border-border font-medium">
                          {field.assignee_email}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-content-muted hover:text-rose-500 p-1 rounded-md transition-colors shrink-0"
                      aria-label="Remove action item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            {initialData ? 'Save Changes' : 'Create Note'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
