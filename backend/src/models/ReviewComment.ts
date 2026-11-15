import mongoose, { Document, Schema, Types } from 'mongoose';
import { CommentPublishingStatus } from '../types';

export interface IReviewComment extends Document {
  reviewId: Types.ObjectId;
  findingId: Types.ObjectId;
  pullRequestId: Types.ObjectId;
  githubCommentId: number | null;
  filePath: string;
  line: number;
  commentBody: string;
  fingerprint: string;
  publishingStatus: CommentPublishingStatus;
  errorMessage: string | null;
  createdAt: Date;
}

const reviewCommentSchema = new Schema<IReviewComment>(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
    findingId: { type: Schema.Types.ObjectId, ref: 'Finding', required: true, index: true },
    pullRequestId: { type: Schema.Types.ObjectId, ref: 'PullRequest', required: true, index: true },
    githubCommentId: { type: Number, default: null },
    filePath: { type: String, required: true },
    line: { type: Number, required: true, min: 1 },
    commentBody: { type: String, required: true },
    fingerprint: { type: String, required: true },
    publishingStatus: {
      type: String,
      enum: ['pending', 'published', 'failed', 'skipped_duplicate'],
      default: 'pending',
      index: true,
    },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'review_comments',
  }
);

reviewCommentSchema.index({ pullRequestId: 1, fingerprint: 1 });
reviewCommentSchema.index({ reviewId: 1, findingId: 1 });

export const ReviewComment = mongoose.model<IReviewComment>('ReviewComment', reviewCommentSchema);
