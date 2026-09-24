import { z } from 'zod';
import { JobTypes, JobStatuses, TestResults } from './enums';

export const JobCardPartSchema = z.object({ partId: z.string().uuid(), quantity: z.number().int().positive() });
export const JobCardSchema = z.object({
  id: z.string().uuid().optional(),
  assetId: z.string().uuid(),
  date: z.coerce.date(),
  jobType: z.enum(JobTypes),
  reportedFault: z.string().optional(),
  workPerformed: z.string().min(5, 'Describe the work performed'),
  hourMeter: z.number().nonnegative().optional(),
  labourHours: z.number().nonnegative().optional(),
  technicianIds: z.array(z.string().uuid()).default([]),
  toolsUsed: z.string().optional(),
  conditionBefore: z.number().int().min(1).max(5).optional(),
  conditionAfter: z.number().int().min(1).max(5).optional(),
  testResult: z.enum(TestResults).optional(),
  nextAction: z.string().optional(),
  status: z.enum(JobStatuses).default('OPEN'),
  parts: z.array(JobCardPartSchema).default([]),
  scheduleId: z.string().uuid().optional(), // link to the maintenance schedule this job fulfils
  techSignatureAttachmentId: z.string().uuid().optional(),
});
export type JobCardInput = z.infer<typeof JobCardSchema>;
export const OPEN_JOB_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_PARTS'] as const;

/** Purchase-request lifecycle (SRS §7.5): OPEN → ORDERED → RECEIVED, or CANCELLED before receipt. RECEIVED and CANCELLED are final. */
export const PR_TRANSITIONS: Record<string, readonly string[]> = { OPEN: ['ORDERED', 'CANCELLED'], ORDERED: ['RECEIVED', 'CANCELLED'], RECEIVED: [], CANCELLED: [] };
