import { Schema, model, Document } from 'mongoose';

export type SyncDirection = 'wix_to_hubspot' | 'hubspot_to_wix' | 'bidirectional';
export type TransformType = 'trim' | 'lowercase' | 'uppercase';

export interface IFieldMapping extends Document {
  siteId: string;
  wixField: string;
  hubspotProperty: string;
  direction: SyncDirection;
  transform?: TransformType | null;
  createdAt: Date;
  updatedAt: Date;
}

const fieldMappingSchema = new Schema<IFieldMapping>(
  {
    siteId: { type: String, required: true, index: true },
    wixField: { type: String, required: true },
    hubspotProperty: { type: String, required: true },
    direction: {
      type: String,
      required: true,
      enum: ['wix_to_hubspot', 'hubspot_to_wix', 'bidirectional'],
      default: 'bidirectional',
    },
    transform: {
      type: String,
      enum: ['trim', 'lowercase', 'uppercase', null],
      default: null,
    },
  },
  { timestamps: true },
);

// Unique: one HubSpot property can only be mapped once per site
fieldMappingSchema.index({ siteId: 1, hubspotProperty: 1 }, { unique: true });

export const FieldMapping = model<IFieldMapping>('FieldMapping', fieldMappingSchema);