import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function computeStatus(incidents: Array<{ status: string }>): 'SECURE' | 'CRITICAL' {
  return incidents.some((i) => i.status === 'Open' || i.status === 'Analyzing')
    ? 'CRITICAL'
    : 'SECURE';
}
