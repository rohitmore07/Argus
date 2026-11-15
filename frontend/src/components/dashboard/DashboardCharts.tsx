'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, FolderGit2, Layers } from 'lucide-react';
import { DashboardAnalytics } from '@/types';
import { CATEGORY_META, SEVERITY_STYLES } from '@/lib/utils';
import { AnimatedTabs } from '@/components/motion';
import { EASE_OUT_EXPO } from '@/components/motion/variants';

type InsightTab = 'trend' | 'distribution' | 'repositories';

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--surface-elevated))',
  border: '1px solid hsl(var(--border-strong))',
  borderRadius: '8px',
  fontSize: '11px',
  fontFamily: 'var(--font-geist-mono)',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
};

function InsightEmpty({ message }: { message: string }) {
  return (
    <div className="relative flex h-[260px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/80 bg-surface-subtle/50 px-6 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sentinel-dots opacity-50"
      />
      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
        </div>
        <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export function DashboardCharts({
  analytics,
  days,
  onDaysChange,
}: {
  analytics: DashboardAnalytics | null;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const [tab, setTab] = useState<InsightTab>('trend');

  const hasTimeSeries = Boolean(analytics && analytics.issuesOverTime.length > 0);
  const hasSeverity = Boolean(
    analytics && analytics.issuesBySeverity.some((item) => item.count > 0)
  );
  const hasCategory = Boolean(
    analytics && analytics.issuesByCategory.some((item) => item.count > 0)
  );
  const hasRepoActivity = Boolean(analytics && analytics.repositoryActivity.length > 0);

  return (
    <section className="rounded-xl border border-border panel-surface p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Review Insights
          </span>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
            Findings Telemetry &amp; Distribution
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AnimatedTabs<InsightTab>
            layoutId="insights-mode-tab"
            activeId={tab}
            onChange={setTab}
            tabs={[
              { id: 'trend', label: 'Trend', icon: <Activity className="h-3 w-3" /> },
              { id: 'distribution', label: 'Breakdown', icon: <Layers className="h-3 w-3" /> },
              { id: 'repositories', label: 'Repos', icon: <FolderGit2 className="h-3 w-3" /> },
            ]}
          />

          <AnimatedTabs<'7' | '30' | '90'>
            layoutId="insights-range-tab"
            activeId={String(days) as '7' | '30' | '90'}
            onChange={(val) => onDaysChange(Number(val))}
            tabs={[
              { id: '7', label: '7d' },
              { id: '30', label: '30d' },
              { id: '90', label: '90d' },
            ]}
          />
        </div>
      </div>

      <div className="pt-5">
        <AnimatePresence mode="wait">
          {tab === 'trend' && (
            <motion.div
              key={`trend-${days}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            >
              {!hasTimeSeries ? (
                <InsightEmpty message="No findings recorded over this window yet. Trigger a Pull Request review to visualize detection trends from MongoDB." />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span>Daily issues detected (last {analytics?.rangeDays || days} days)</span>
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-indigo-400" />
                        Total
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Critical
                      </span>
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={analytics!.issuesOverTime}
                        margin={{ top: 8, right: 6, left: -24, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="sentinelTotalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="sentinelCritGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.26} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="2 4"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name="Total Findings"
                          stroke="#818cf8"
                          strokeWidth={1.75}
                          fill="url(#sentinelTotalGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="critical"
                          name="Critical"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          fill="url(#sentinelCritGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'distribution' && (
            <motion.div
              key="distribution"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            >
              {!hasSeverity && !hasCategory ? (
                <InsightEmpty message="No active severity or category findings recorded in MongoDB yet." />
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      By Severity Tier
                    </p>
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analytics!.issuesBySeverity}
                          margin={{ top: 6, right: 6, left: -24, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="2 4"
                            stroke="hsl(var(--border))"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="severity"
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="count" name="Findings" radius={[4, 4, 0, 0]} maxBarSize={36}>
                            {analytics!.issuesBySeverity.map((entry) => (
                              <Cell
                                key={entry.severity}
                                fill={SEVERITY_STYLES[entry.severity].chartColor}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      By Specialist Agent
                    </p>
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analytics!.issuesByCategory}
                          margin={{ top: 6, right: 6, left: -24, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="2 4"
                            stroke="hsl(var(--border))"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="count" name="Findings" radius={[4, 4, 0, 0]} maxBarSize={38}>
                            {analytics!.issuesByCategory.map((entry) => (
                              <Cell
                                key={entry.category}
                                fill={CATEGORY_META[entry.category].color}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'repositories' && (
            <motion.div
              key="repositories"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            >
              {!hasRepoActivity ? (
                <InsightEmpty message="Connect a repository and complete a Pull Request review to compare activity across repositories." />
              ) : (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics!.repositoryActivity}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="hsl(var(--border))"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="repository"
                        width={145}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar
                        dataKey="reviewsCount"
                        name="PRs Reviewed"
                        fill="#818cf8"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                      <Bar
                        dataKey="findingsCount"
                        name="Findings"
                        fill="#f97316"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
