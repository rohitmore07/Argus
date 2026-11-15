'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Github, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AnimatedStatusIndicator } from '@/components/motion';
import { EASE_OUT_EXPO } from '@/components/motion/variants';

export default function LoginPage() {
  const { health } = useAuth();
  const ready = Boolean(
    health?.services.githubOAuth.configured && health?.services.mongodb.connected
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Atmospheric lighting + architectural grid */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 sentinel-ambient-bg" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-sentinel-grid opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_20%,transparent_100%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border-strong panel-elevated p-7 shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
        >
          <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-400/80 to-transparent animate-scanline" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-400/35 bg-indigo-500/15 text-indigo-400 shadow-[0_0_24px_-6px_rgba(99,102,241,0.8)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <AnimatedStatusIndicator
            status={ready ? 'active' : 'warning'}
            label={ready ? 'OAUTH READY' : 'SETUP REQUIRED'}
            size="xs"
          />
        </div>

        <div className="mt-6 space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            PR Sentinel · Developer Access
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Sign in with GitHub
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Authenticate with GitHub OAuth to connect repositories, register HMAC-verified Pull
            Request webhooks, and run multi-agent Gemini security &amp; bug reviews.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Button className="w-full" size="lg" disabled={!ready} asChild={ready}>
            {ready ? (
              <a href="/api/auth/github">
                <Github className="h-4 w-4" />
                Continue with GitHub
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <>
                <Github className="h-4 w-4" />
                GitHub OAuth Not Configured Yet
              </>
            )}
          </Button>

          <div className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
            <Lock className="h-3 w-3 text-emerald-400" />
            <span>AES-256-GCM token encryption · Zero auto-merge</span>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Return to Command Gateway
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
