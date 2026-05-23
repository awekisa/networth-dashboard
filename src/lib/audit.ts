import { prisma } from './db';
export async function audit(action: 'MANUAL_CREATE' | 'MANUAL_UPDATE' | 'MANUAL_DELETE' | 'SYNC_ATTEMPT' | 'SYNC_SUCCESS' | 'SYNC_FAILURE', safeMetadata: Record<string, unknown> = {}, subjectType?: string, subjectId?: string) {
  const redacted = JSON.parse(JSON.stringify(safeMetadata, (key, value) => /secret|token|key|password|private|seed|phrase/i.test(key) ? '[REDACTED]' : value));
  return prisma.auditLog.create({ data: { action, subjectType, subjectId, safeMetadataJson: JSON.stringify(redacted) } });
}
