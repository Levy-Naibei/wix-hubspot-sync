import { Schema, model, Document } from 'mongoose';

export interface IContactMapping extends Document {
  siteId: string;
  wixContactId: string;
  hubspotContactId: string;
  lastSyncedAt: Date;
  lastSyncSource: 'wix' | 'hubspot';
  createdAt: Date;
  updatedAt: Date;
}

const contactMappingSchema = new Schema<IContactMapping>(
  {
    siteId: { type: String, required: true, index: true },
    wixContactId: { type: String, required: true, unique: true, index: true },
    hubspotContactId: { type: String, required: true, unique: true, index: true },
    lastSyncedAt: { type: Date, required: true, default: Date.now },
    lastSyncSource: { type: String, required: true, enum: ['wix', 'hubspot'] },
  },
  { timestamps: true },
);

export const ContactMapping = model<IContactMapping>('ContactMapping', contactMappingSchema);