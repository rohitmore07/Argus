import mongoose, { Document, Schema, Types } from 'mongoose';
import { ChangedFileRecord, PullRequestReviewStatus } from '../types';

export interface IPullRequest extends Document {
  repositoryId: Types.ObjectId;
  githubPRId: number;
  prNumber: number;
  title: string;
  description: string;
  author: string;
  authorAvatarUrl: string;
  htmlUrl: string;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  baseSha: string;
  changedFiles: ChangedFileRecord[];
  changedFilesCount: number;
  additions: number;
  deletions: number;
  reviewStatus: PullRequestReviewStatus;
  lastReviewedSha: string | null;
  latestReviewId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const changedFileSchema = new Schema<ChangedFileRecord>(
  {
    filename: { type: String, required: true },
    previousFilename: { type: String },
    status: {
      type: String,
      enum: ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'],
      default: 'modified',
    },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changes: { type: Number, default: 0 },
    patch: { type: String, default: '' },
    blobUrl: { type: String, default: '' },
  },
  { _id: false }
);

const pullRequestSchema = new Schema<IPullRequest>(
  {
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
    githubPRId: { type: Number, required: true },
    prNumber: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    author: { type: String, required: true, trim: true, index: true },
    authorAvatarUrl: { type: String, default: '' },
    htmlUrl: { type: String, default: '' },
    state: {
      type: String,
      enum: ['open', 'closed', 'merged'],
      default: 'open',
      index: true,
    },
    sourceBranch: { type: String, required: true },
    targetBranch: { type: String, required: true },
    headSha: { type: String, required: true },
    baseSha: { type: String, required: true },
    changedFiles: { type: [changedFileSchema], default: [] },
    changedFilesCount: { type: Number, default: 0 },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    reviewStatus: {
      type: String,
      enum: ['pending', 'queued', 'in_progress', 'completed', 'awaiting_approval', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    lastReviewedSha: { type: String, default: null },
    latestReviewId: { type: Schema.Types.ObjectId, ref: 'Review', default: null },
  },
  {
    timestamps: true,
    collection: 'pull_requests',
  }
);

// Compound unique indexes preventing duplicate PR records per repository
pullRequestSchema.index({ repositoryId: 1, githubPRId: 1 }, { unique: true });
pullRequestSchema.index({ repositoryId: 1, prNumber: 1 }, { unique: true });
pullRequestSchema.index({ repositoryId: 1, updatedAt: -1 });

export const PullRequest = mongoose.model<IPullRequest>('PullRequest', pullRequestSchema);
