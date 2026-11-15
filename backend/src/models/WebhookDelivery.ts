import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhookDelivery extends Document {
  deliveryId: string;
  event: string;
  action: string;
  repositoryFullName: string;
  createdAt: Date;
}

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    deliveryId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    action: { type: String, default: '' },
    repositoryFullName: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'webhook_deliveries',
  }
);

// 7-day idempotency window for GitHub webhook retries
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const WebhookDelivery = mongoose.model<IWebhookDelivery>(
  'WebhookDelivery',
  webhookDeliverySchema
);
