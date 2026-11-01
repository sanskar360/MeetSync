import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines Tailwind classes safely with clsx and twMerge
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Extract 2-letter uppercase initials from a person's name
 */
export function getInitials(name = '') {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
