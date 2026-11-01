/**
 * Transcript Constants & Validation Schemas for MeetSync
 */

/**
 * Client allow-list for transcript file extensions.
 * TODO: Confirm allowed transcript file formats with FastAPI backend (app/schemas or /docs).
 */
export const ALLOWED_TRANSCRIPT_EXTENSIONS = [
  '.vtt',
  '.srt',
  '.json',
  '.txt',
  '.md',
  '.docx',
  '.pdf',
];

/**
 * Client allow-list MIME types corresponding to allowed extensions.
 */
export const ALLOWED_TRANSCRIPT_MIME_TYPES = [
  'text/vtt',
  'application/x-subrip',
  'text/plain',
  'application/json',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Maximum transcript file size in bytes (25 MB).
 * Constant defined per specification.
 */
export const MAX_TRANSCRIPT_FILE_SIZE = 25 * 1024 * 1024; // 25 MB in bytes

/**
 * Validation statuses for transcripts.
 * NOTE: NEEDS_REVIEW is NOT an upload failure, but a flag indicating low-confidence segments.
 */
export const TRANSCRIPT_STATUS = {
  ACCEPTED: 'ACCEPTED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED',
};

/**
 * Validates a file before upload.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTranscriptFile(file) {
  if (!file) {
    return { valid: false, error: 'Please select a file to upload.' };
  }

  // 1. Check file size
  if (file.size > MAX_TRANSCRIPT_FILE_SIZE) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds the 25 MB limit. Selected file is ${sizeInMb} MB.`,
    };
  }

  // 2. Check file extension
  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_TRANSCRIPT_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file format "${extension}". Allowed formats are: ${ALLOWED_TRANSCRIPT_EXTENSIONS.join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Formats bytes to readable KB/MB string
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Extracts format tag from filename (e.g. "VTT", "SRT", "JSON")
 */
export function getTranscriptFormat(filename = '') {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts.pop().toUpperCase();
  }
  return 'TXT';
}
