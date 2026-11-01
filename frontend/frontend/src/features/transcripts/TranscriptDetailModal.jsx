import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTranscriptText, downloadTranscriptFile } from '@/api/transcripts';
import { formatLocalDate, formatLocalTime } from '@/lib/date';
import { formatFileSize, getTranscriptFormat, TRANSCRIPT_STATUS } from '@/types/transcript';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  FileAudio,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  ShieldCheck,
  Info,
} from 'lucide-react';

/**
 * TranscriptDetailModal
 * Displays:
 * - Metadata: filename, format, size, uploader, date, status
 * - Validation report rendered exactly as returned
 * - Prominent note that NEEDS_REVIEW is NOT an upload failure
 * - Extracted text viewer with word count
 * - "Download original" button
 * - NO delete button per specification
 */
export function TranscriptDetailModal({ transcript, isOpen, onClose, meetingId }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const effectiveMeetingId = meetingId || transcript?.meeting_id;
  const status = transcript?.validation_status || transcript?.status || 'ACCEPTED';
  const filename = transcript?.original_filename || transcript?.filename || 'transcript';
  const format = (transcript?.file_format || transcript?.format || getTranscriptFormat(filename)).replace('.', '').toUpperCase();
  const createdAt = transcript?.created_at || transcript?.uploaded_at;

  // Fetch full transcript text
  const {
    data: rawTranscriptText = '',
    isLoading: isTextLoading,
    isError: isTextError,
  } = useQuery({
    queryKey: ['transcript', transcript?.id, 'text'],
    queryFn: () => getTranscriptText(effectiveMeetingId, transcript?.id),
    enabled: Boolean(isOpen && transcript?.id),
    staleTime: 1000 * 60 * 5,
  });

  if (!transcript) return null;

  const transcriptText =
    typeof rawTranscriptText === 'object' && rawTranscriptText !== null
      ? rawTranscriptText.content_text || ''
      : (rawTranscriptText || '');

  const wordCount =
    transcript?.word_count ||
    (typeof rawTranscriptText === 'object' && rawTranscriptText?.word_count) ||
    (transcriptText ? transcriptText.trim().split(/\s+/).filter(Boolean).length : 0);

  const isAccepted = status === TRANSCRIPT_STATUS.ACCEPTED;
  const isNeedsReview = status === TRANSCRIPT_STATUS.NEEDS_REVIEW;
  const isRejected = status === TRANSCRIPT_STATUS.REJECTED;

  const validationReport = transcript.validation_report || {
    participant_mismatch: isRejected,
    timestamp_match: isAccepted,
    details: transcript.status_message || 'Validation report details not provided.',
  };

  const formatDiagnostics = (details) => {
    if (!details) return null;
    if (typeof details === 'string') return details;
    if (typeof details === 'object') {
      const entries = Object.entries(details).filter(([_, v]) => v !== undefined && v !== null);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' • ');
    }
    return String(details);
  };

  const diagnosticsText = formatDiagnostics(validationReport.details);
  const warningsList = Array.isArray(validationReport.warnings) ? validationReport.warnings : [];

  const handleCopyText = async () => {
    if (!transcriptText) return;
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      toast.success('Transcript text copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDownload = async () => {
    try {
      await downloadTranscriptFile(effectiveMeetingId, transcript.id, filename);
      toast.success(`Downloading ${filename}`);
    } catch (err) {
      toast.error(err.message || 'Failed to download transcript file');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <DialogHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <Badge status={status} size="sm" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted px-2 py-0.5 rounded bg-surface-subtle border border-border">
            {format}
          </span>
          <span className="text-xs text-content-muted">
            {formatFileSize(transcript.file_size)}
          </span>
        </div>

        <DialogTitle className="text-lg sm:text-xl font-bold truncate">
          {filename}
        </DialogTitle>

        <DialogDescription className="text-xs text-content-muted mt-1 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 font-medium text-content-secondary">
            <User className="w-3.5 h-3.5 text-primary" />
            Uploaded by {transcript.uploader || 'Note Taker'}
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
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-5 max-h-[72vh] overflow-y-auto">
        {/* VALIDATION REPORT SECTION */}
        <div className="rounded-2xl border border-border p-4 bg-surface-subtle/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-content-primary flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Engine Validation Report</span>
            </span>
            <Badge status={status} size="sm" />
          </div>

          {/* Validation Flags Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface-card border border-border flex items-center justify-between">
              <span className="text-content-secondary">Participant Roster Match:</span>
              <span className="font-semibold flex items-center gap-1">
                {!validationReport.participant_mismatch ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-300">Aligned</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-500" />
                    <span className="text-rose-700 dark:text-rose-300">Mismatch Flagged</span>
                  </>
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-card border border-border flex items-center justify-between">
              <span className="text-content-secondary">Timestamp Monotonicity:</span>
              <span className="font-semibold flex items-center gap-1">
                {validationReport.timestamp_match ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-300">Verified</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-700 dark:text-amber-300">Review Required</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Warnings List if any */}
          {warningsList.length > 0 && (
            <div className="space-y-1 bg-amber-50/60 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-200">
              <strong className="block font-semibold mb-1">Validation Warnings:</strong>
              <ul className="list-disc pl-4 space-y-0.5">
                {warningsList.map((warning, idx) => (
                  <li key={idx}>{typeof warning === 'object' ? JSON.stringify(warning) : String(warning)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Message */}
          {diagnosticsText && (
            <p className="text-xs text-content-secondary bg-surface-card p-3 rounded-xl border border-border leading-relaxed">
              <strong>Diagnostics:</strong> {diagnosticsText}
            </p>
          )}

          {/* Crucial Note for NEEDS_REVIEW per Master Context */}
          {isNeedsReview && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Notice:</strong> <code>NEEDS_REVIEW</code> is <strong>not</strong> an upload failure. The transcript has been ingested and parsed, but contains low-confidence segments flagged for human verification.
              </div>
            </div>
          )}

          {/* Rejection notice */}
          {isRejected && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>Upload Rejected:</strong> The transcription engine was unable to validate this file format or corrupted audio stream.
              </div>
            </div>
          )}
        </div>

        {/* EXTRACTED TEXT VIEWER */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-content-primary">
                Extracted Text Content
              </span>
              <span className="text-xs text-content-muted">
                ({wordCount} words)
              </span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={handleCopyText}
              disabled={isTextLoading || !transcriptText}
            >
              {copied ? 'Copied' : 'Copy Text'}
            </Button>
          </div>

          {/* Text scroll box */}
          {isTextLoading ? (
            <div className="space-y-2 p-4 rounded-xl border border-border bg-surface-subtle">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : isTextError ? (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-600">
              Failed to load transcript text from server.
            </div>
          ) : (
            <pre className="p-4 rounded-2xl bg-surface-subtle border border-border font-mono text-xs text-content-primary whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto selection:bg-primary-100">
              {transcriptText || 'No text extracted.'}
            </pre>
          )}
        </div>
      </DialogContent>

      {/* Footer with "Download original" and Close button (NO delete button per spec) */}
      <DialogFooter className="justify-between">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download className="w-4 h-4" />}
          onClick={handleDownload}
        >
          Download original
        </Button>

        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
