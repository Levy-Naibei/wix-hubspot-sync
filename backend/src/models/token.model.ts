import { Schema, model, Document } from 'mongoose';

export interface IToken extends Document {
  siteId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
  hubspotPortalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tokenSchema = new Schema<IToken>(
  {
    siteId: { type: String, required: true, unique: true, index: true },
    encryptedAccessToken: { type: String, required: true },
    encryptedRefreshToken: { type: String, required: true },
    expiresAt: { type: Number, required: true },
    scope: { type: String, required: true },
    tokenType: { type: String, required: true, default: 'Bearer' },
    hubspotPortalId: { type: String },
  },
  { timestamps: true },
);

export const Token = model<IToken>('Token', tokenSchema);