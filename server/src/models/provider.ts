import mongoose, { Schema } from 'mongoose';

const providerResourceSchema = new Schema({
  provider: { type: String, enum: ['GitHub', 'Vercel', 'Render'], required: true },
  accountId: { type: String, required: true, default: 'default' },
  resourceType: { type: String, enum: ['repository', 'project', 'service', 'deployment'], required: true },
  externalId: { type: String, required: true },
  name: { type: String, required: true },
  url: String,
  status: String,
  normalizedStatus: String,
  repositoryKey: String,
  associationConfidence: { type: String, enum: ['exact', 'unmatched'], default: 'unmatched' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  lastSyncedAt: { type: Date, required: true },
  unavailableAt: Date,
}, { timestamps: true, strict: 'throw' });
providerResourceSchema.index({ provider: 1, accountId: 1, resourceType: 1, externalId: 1 }, { unique: true });
providerResourceSchema.index({ provider: 1, resourceType: 1, updatedAt: -1 });
providerResourceSchema.index({ repositoryKey: 1 });

const providerSyncSchema = new Schema({
  provider: { type: String, enum: ['GitHub', 'Vercel', 'Render'], required: true },
  accountId: { type: String, required: true, default: 'default' },
  status: { type: String, enum: ['running', 'success', 'partial', 'failed'], required: true },
  startedAt: { type: Date, required: true }, completedAt: Date, lastSuccessfulAt: Date, accountName: String,
  discovered: { type: Number, default: 0 }, updated: { type: Number, default: 0 }, unchanged: { type: Number, default: 0 }, failed: { type: Number, default: 0 },
  error: { type: String, maxlength: 500 },
}, { timestamps: true, strict: 'throw' });
providerSyncSchema.index({ provider: 1, accountId: 1, startedAt: -1 });

const providerLeaseSchema = new Schema({
  provider: { type: String, enum: ['GitHub', 'Vercel', 'Render'], required: true },
  accountId: { type: String, required: true }, leaseUntil: { type: Date, required: true },
}, { timestamps: true, strict: 'throw' });
providerLeaseSchema.index({ provider: 1, accountId: 1 }, { unique: true });

export const ProviderResource = mongoose.models.ProviderResource || mongoose.model('ProviderResource', providerResourceSchema);
export const ProviderSync = mongoose.models.ProviderSync || mongoose.model('ProviderSync', providerSyncSchema);
export const ProviderLease = mongoose.models.ProviderLease || mongoose.model('ProviderLease', providerLeaseSchema);
