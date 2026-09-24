import { z } from 'zod';
import { DEFAULT_ALERT_THRESHOLD } from './schemas';

/**
 * Operational policy an admin can change at runtime (SRS §5.3, §7.6):
 *  - readingAlertThreshold: a daily reading rated at or below this raises a maintenance review.
 *  - jobCardApprovalRequired: a completed job card only counts as done (machine back in service) once a supervisor approves it.
 */
export const OperationsSettingsSchema = z.object({
  readingAlertThreshold: z.number().int().min(1).max(5),
  jobCardApprovalRequired: z.boolean(),
});
export type OperationsSettings = z.infer<typeof OperationsSettingsSchema>;
export const DEFAULT_OPERATIONS_SETTINGS: OperationsSettings = { readingAlertThreshold: DEFAULT_ALERT_THRESHOLD, jobCardApprovalRequired: true };
