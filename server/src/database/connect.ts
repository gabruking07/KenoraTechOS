import mongoose from 'mongoose';
import { ProviderLease, ProviderResource } from '../models/provider.js';
export async function connectDatabase(uri: string) { mongoose.set('strictQuery', true); await mongoose.connect(uri); for(const [model,index] of [[ProviderResource,'provider_1_accountId_1_resourceType_1_externalId_1'],[ProviderLease,'provider_1_accountId_1']] as const){try{await model.collection.dropIndex(index)}catch(error){if(![26,27].includes((error as any)?.code))throw error}} console.log('Database connected'); }
