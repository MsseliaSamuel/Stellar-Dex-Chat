'use client';

import React from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { StatusKind } from '@/lib/statusContrast';

export interface TransactionStatusCueProps {
  status: StatusKind;
  /** Override the default status label (for example "Retry available"). */
  label?: string;
  className?: string;
}

export const STATUS_LABELS: Record<StatusKind, string> = {
  progress: 'In progress',
  success: 'Completed',
  warning: 'Needs attention',
  failure: 'Failed',
};

const STATUS_ICONS: Record<StatusKind, LucideIcon> = {
  progress: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle,
  failure: XCircle,
};

/**
 * Non-animated, three-channel status cue: shape (icon), text and colour.
 *
 * The icon and the visible label are always rendered, including under
 * `prefers-reduced-motion: reduce`; only the optional progress spinner is
 * suppressed. Screen readers receive a dedicated sr-only label so status is
 * never conveyed by colour or motion alone.
 */
export const TransactionStatusCue: React.FC<TransactionStatusCueProps> = ({
  status,
  label,
  className,
}) => {
  const reducedMotion = useReducedMotion();
  const Icon = STATUS_ICONS[status];
  const text = label ?? STATUS_LABELS[status];

  return (
    <span
      data-testid="transaction-status-cue"
      data-status={status}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className={clsx(
        'status-cue',
        `status-${status}`,
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        className={clsx(
          'status-cue-icon h-3.5 w-3.5 flex-shrink-0',
          status === 'progress' && !reducedMotion && 'animate-spin',
        )}
      />
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">Status: {text}</span>
    </span>
  );
};

export default TransactionStatusCue;
