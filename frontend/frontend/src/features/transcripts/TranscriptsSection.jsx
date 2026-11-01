import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMeetingTranscripts, uploadTranscript } from '@/api/transcripts';
import { formatLocalDate, formatLocalTime } from '@/lib/date';
import {
  ALLOWED_TRANSCRIPT_EXTENSIONS,
  validateTranscriptFile,
  formatFileSize,
  getTranscriptFormat,
  TRANSCRIPT_STATUS,
} from '@/types/transcript';
import { Card, CardHeader, CardTitle, CardEyebrow, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TranscriptDetailModal } from './TranscriptDetailModal';
import { useToast } from '@/components/ui/Toast';
import {
  FileAudio,
  Upload,
  AlertTriangle,
  Clock,
  User,
  ArrowRight,
  Loader2,
} from 'lucide-react';

export function TranscriptsSection({ meetingId, userRole, canUploadTranscript }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [clientFileError, setClientFileError] = useState(null);

  // Fetch transcripts for meeting
  const {
    data: transcripts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['transcripts', meetingId],
    queryFn: () => getMeetingTranscripts(meetingId),
    enabled: Boolean(meetingId),
  });

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: (file) => uploadTranscript(meetingId, file),
    onSuccess: (uploaded) => {
      queryClient.invalidateQueries({ queryKey: ['transcripts', meetingId] });
      setClientFileError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const uploadStatus = uploaded.validation_status || uploaded.status;
      if (uploadStatus === TRANSCRIPT_STATUS.NEEDS_REVIEW) {
        toast.warning('Transcript uploaded: Segments flagged for review (NEEDS_REVIEW).');
      } else if (uploadStatus === TRANSCRIPT_STATUS.REJECTED) {
        toast.error('Transcript rejected by engine: invalid or corrupted stream.');
      } else {
        toast.success('Transcript uploaded and validated successfully');
      }
    },
    onError: (err) => {
      if (err.status === 403) {
        toast.error('Permission denied: Only Note Takers are authorized to upload transcripts.');
      } else {
        toast.error(err.message || 'Failed to upload transcript');
      }
    },
  });

  // Handle file selection and client-side validation
  const handleProcessFile = (file) => {
    if (!file) return;

    // Validate allowed extension and max size 25 MB
    const validation = validateTranscriptFile(file);
    if (!validation.valid) {
      setClientFileError(validation.error);
      toast.error(validation.error);
      return;
    }

    setClientFileError(null);
    uploadMutation.mutate(file);
  };

  // Drag-and-drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-card border-border">
        <CardHeader className="border-b border-border-subtle pb-4">
          <Skeleton className="h-6 w-36 rounded-lg" />
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="shadow-card border-border p-6">
        <ErrorState
          status={error?.status}
          title="Error Loading Transcripts"
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
            <CardEyebrow>AUDIO & TEXT INGESTION</CardEyebrow>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <FileAudio className="w-5 h-5 text-indigo-500" />
              <span>Transcripts ({transcripts.length})</span>
            </CardTitle>
          </div>

          <span className="text-[11px] font-semibold text-content-muted bg-surface-subtle px-2.5 py-1 rounded-full border border-border">
            Allowed: .vtt, .srt, .json (≤25MB)
          </span>
        </div>
        <p className="text-xs text-content-secondary mt-1">
          {canUploadTranscript
            ? 'As Note Taker, you can upload meeting recording files or subtitle documents for automated validation.'
            : 'Validated transcripts and automated speech recognition results.'}
        </p>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Note Taker only: Upload Panel with drag & drop */}
        {canUploadTranscript && (
          <div className="space-y-3">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-150 cursor-pointer ${
                dragActive
                  ? 'border-primary bg-primary-50/60 dark:bg-primary-950/40 ring-4 ring-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-surface-subtle/50 bg-surface-app/40'
              } ${uploadMutation.isPending ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TRANSCRIPT_EXTENSIONS.join(',')}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleProcessFile(e.target.files[0]);
                  }
                }}
                disabled={uploadMutation.isPending}
                className="hidden"
                aria-label="Upload transcript file"
              />

              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-950/70 border border-primary/20 flex items-center justify-center text-primary">
                  {uploadMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-content-primary">
                    {uploadMutation.isPending
                      ? 'Processing and validating transcript...'
                      : 'Drop your transcript file here, or browse'}
                  </p>
                  <p className="text-xs text-content-muted">
                    Supports {ALLOWED_TRANSCRIPT_EXTENSIONS.join(', ')} • Maximum file size 25 MB
                  </p>
                </div>

                {uploadMutation.isPending && (
                  <div className="w-full max-w-xs mt-2 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full animate-pulse w-3/4 rounded-full" />
                  </div>
                )}
              </div>
            </div>

            {/* Client file validation error message */}
            {clientFileError && (
              <p className="text-xs text-rose-500 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{clientFileError}</span>
              </p>
            )}
          </div>
        )}

        {/* Transcripts List */}
        {transcripts.length === 0 ? (
          <EmptyState
            icon={<FileAudio className="w-8 h-8 text-slate-400" />}
            title="No transcripts available"
            description={
              canUploadTranscript
                ? 'No transcripts uploaded yet. Upload a transcript file (.vtt, .srt, .json, .txt, .md, .docx, .pdf) above to start automated analysis.'
                : 'No transcripts have been uploaded for this meeting yet.'
            }
            className="py-8 border-dashed"
          />
        ) : (
          <div className="space-y-3">
            {transcripts.map((item) => {
              const filename = item.original_filename || item.filename || 'transcript';
              const format = (item.file_format || item.format || getTranscriptFormat(filename)).replace('.', '').toUpperCase();
              const status = item.validation_status || item.status || 'ACCEPTED';
              const createdAt = item.created_at || item.uploaded_at;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedTranscript(item)}
                  className="p-4 rounded-2xl bg-surface-app border border-border hover:border-primary/40 hover:shadow-soft transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  {/* Filename, format, size, uploader, date */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-primary-50 dark:bg-primary-950/60 border border-primary/20 shrink-0">
                        {format}
                      </span>
                      <h4 className="text-sm font-bold text-content-primary truncate group-hover:text-primary transition-colors">
                        {filename}
                      </h4>
                      <Badge status={status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-content-muted">
                      <span className="font-semibold text-content-secondary">
                        {formatFileSize(item.file_size)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {item.uploader || 'Note Taker'}
                      </span>
                      {createdAt && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatLocalDate(createdAt)} at {formatLocalTime(createdAt)}
                          </span>
                        </>
                      )}
                      {item.word_count > 0 && (
                        <>
                          <span>•</span>
                          <span>{item.word_count.toLocaleString()} words</span>
                        </>
                      )}
                    </div>

                    {/* Quality warning snippet if NEEDS_REVIEW or REJECTED */}
                    {item.status_message && status !== TRANSCRIPT_STATUS.ACCEPTED && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5 pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">{item.status_message}</span>
                      </p>
                    )}
                  </div>

                  {/* Open Details Action */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Transcript Detail Modal */}
      <TranscriptDetailModal
        transcript={selectedTranscript}
        meetingId={meetingId}
        isOpen={Boolean(selectedTranscript)}
        onClose={() => setSelectedTranscript(null)}
      />
    </Card>
  );
}
