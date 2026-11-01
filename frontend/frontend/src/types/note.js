import { z } from 'zod';

/**
 * MeetSync Note & Action Item Schemas
 * Aligned with FastAPI backend schema.
 * Note: action_items is stored as JSONB in PostgreSQL.
 */

/**
 * Zod Schema for an individual Action Item.
 * Field names match backend ActionItemSchema exactly:
 *   description   → maps to backend `description` (str, 1..500 chars)
 *   assignee_email→ maps to backend `assignee_email` (Optional[str])
 *   is_completed  → maps to backend `is_completed` (bool)
 */
export const actionItemSchema = z.object({
  id: z.string().default(() => `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`),
  description: z.string().min(1, 'Action item description cannot be empty').max(500, 'Description too long'),
  assignee_email: z.string().optional().default(''),
  is_completed: z.boolean().default(false),
});

/**
 * Zod Schema for Note creation and updates.
 * Matches backend NoteCreateRequest and NoteUpdateRequest:
 *   title:        str, min 1, max 255 (backend enforces 255)
 *   content:      str, min 1
 *   action_items: list[ActionItemSchema]
 */
export const noteFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Note title is required')
    .max(255, 'Title cannot exceed 255 characters'),
  content: z
    .string()
    .min(1, 'Note content is required'),
  action_items: z
    .array(actionItemSchema)
    .default([]),
});

/**
 * Backend NoteResponse shape (GET /api/meetings/{id}/notes, POST, PATCH)
 * @typedef {Object} ActionItem
 * @property {string} description    - Action item text (backend field name)
 * @property {string} [assignee_email] - Assignee email (backend field name)
 * @property {boolean} is_completed  - Completion state (backend field name)
 * @property {string|null} [due_date] - ISO 8601 due date
 *
 * @typedef {Object} Note
 * @property {string} id              - Note UUID
 * @property {string} meeting_id      - Parent meeting UUID
 * @property {string} author_user_id  - UUID of the author user (backend field name)
 * @property {string} title           - Note title
 * @property {string} content         - Plain text content
 * @property {string} created_at      - ISO 8601 creation timestamp
 * @property {string} updated_at      - ISO 8601 last update timestamp
 * @property {ActionItem[]} action_items - JSONB list of action items
 */
