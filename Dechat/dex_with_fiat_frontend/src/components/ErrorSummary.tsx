'use client';

import React, { useEffect, useRef } from 'react';
import {
  AlertCircle,
  WifiOff,
  ShieldOff,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react';
import type { AccessibleError, ErrorCategory } from '@/lib/errorMessages';
import { buildErrorSummary } from '@/lib/errorMessages';
import { useReducedMotion } from '@/hooks/useReducedMotion';

function categoryIcon(category: ErrorCategory): React.ReactNode {
  switch (category) {
    case 'network':
      return <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'auth':
      return <ShieldOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    case 'validation':
      return (
        <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      );
    case 'rate_limit':
      return (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      );
    default:
      return <XCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
  }
}

function containerClasses(category: ErrorCategory): string {
  const base =
    'flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm';
  switch (category) {
    case 'network':
      return `${base} border-amber-500/40 bg-amber-950/30 text-amber-300`;
    case 'auth':
      return `${base} border-orange-500/40 bg-orange-950/30 text-orange-300`;
    case 'rate_limit':
      return `${base} border-yellow-500/40 bg-yellow-950/30 text-yellow-300`;
    default:
      return `${base} theme-soft-danger border-red-500/40`;
  }
}

export interface ErrorSummaryProps {
  id: string;
  error: AccessibleError | null | undefined;
  onDismiss?: () => void;
  className?: string;
  inline?: boolean;
  'data-testid'?: string;
}

export default function ErrorSummary({
  id,
  error,
  onDismiss,
  className = '',
  inline = false,
  'data-testid': testId = 'error-summary',
}: ErrorSummaryProps) {
  const prevMessageRef = useRef<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!error) return;
    const summary = buildErrorSummary(error);
    if (summary === prevMessageRef.current) return;
    prevMessageRef.current = summary;
    summaryRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [error, reducedMotion]);

  if (!error) return null;

  const summary = buildErrorSummary(error);
  if (!summary) return null;

  return (
    <div
      ref={summaryRef}
      id={id}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid={testId}
      className={`${containerClasses(error.category)} ${className}`}
    >
      {categoryIcon(error.category)}
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-snug">{error.message}</p>
        {error.action && (
          <p className="text-xs opacity-80 mt-0.5 leading-relaxed">
            {error.action}
          </p>
        )}
      </div>
      {!inline && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
