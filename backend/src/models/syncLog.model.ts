import { Schema, model, Document } from 'mongoose';

export type SyncDirection = 'wix_to_hubspot' | 'hubspot_to_wix' | 'form_to_hubspot';
export type SyncStatus = 'success' | 'skipped' | 'error';

export interface ISyncLog extends Document {
  siteId: string;
  direction: SyncDirection;
  wixContactId?: string;
  hubspotContactId?: string;
  status: SyncStatus;
  reason?: string;
  correlationId: string;
  createdAt: Date;
}

const syncLogSchema = new Schema<ISyncLog>(
  {
    siteId: { type: String, required: true, index: true },
    direction: {
      type: String,
      required: true,
      enum: ['wix_to_hubspot', 'hubspot_to_wix', 'form_to_hubspot'],
    },
    wixContactId: { type: String },
    hubspotContactId: { type: String },
    status: { type: String, required: true, enum: ['success', 'skipped', 'error'] },
    reason: { type: String },
    correlationId: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Index for dashboard queries — site + time descending
syncLogSchema.index({ siteId: 1, createdAt: -1 });

// TTL: auto-delete log entries older than 90 days
syncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const SyncLog = model<ISyncLog>('SyncLog', syncLogSchema);