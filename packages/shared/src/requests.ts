import { z } from 'zod';

/** Requests from the field (client spec §4A tab 7, §4B tab 6): routed to the Operations Manager, Finance Manager and Admin. */
export const RequestTypes = ['CONSUMABLES', 'EQUIPMENT', 'SAFETY', 'HR', 'FINANCE', 'OTHER'] as const;
export const RequestPriorities = ['LOW', 'MEDIUM', 'URGENT'] as const;
export const RequestStatuses = ['RECEIVED', 'IN_PROGRESS', 'RESOLVED'] as const;
export type RequestStatus = (typeof RequestStatuses)[number];

export const RequestTypeLabel: Record<(typeof RequestTypes)[number], string> = { CONSUMABLES: 'Consumables', EQUIPMENT: 'Equipment', SAFETY: 'Safety', HR: 'HR', FINANCE: 'Finance', OTHER: 'Other' };
export const RequestPriorityLabel: Record<(typeof RequestPriorities)[number], string> = { LOW: 'Low', MEDIUM: 'Medium', URGENT: 'Urgent' };
export const RequestStatusLabel: Record<RequestStatus, string> = { RECEIVED: 'Received', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' };
/** Roles a new request is delivered to. */
export const REQUEST_RECIPIENT_ROLES = ['MANAGER', 'FINANCE', 'ADMIN'];

export const RequestSchema = z.object({
  id: z.string().uuid().optional(), // client-generated for offline
  type: z.enum(RequestTypes),
  priority: z.enum(RequestPriorities),
  details: z.string().trim().min(3).max(4000),
  /** Machine the request is about — filled from the submitter's assignment. */
  assetId: z.string().uuid().optional(),
});
export type RequestInput = z.infer<typeof RequestSchema>;

export const RequestReplySchema = z
  .object({ body: z.string().trim().max(4000).default(''), status: z.enum(RequestStatuses).optional() })
  .refine((r) => r.body.length > 0 || !!r.status, { message: 'Write a reply or change the status', path: ['body'] });
export type RequestReplyInput = z.infer<typeof RequestReplySchema>;

export const requestNumber = (n: number) => `REQ-${String(n).padStart(4, '0')}`;
