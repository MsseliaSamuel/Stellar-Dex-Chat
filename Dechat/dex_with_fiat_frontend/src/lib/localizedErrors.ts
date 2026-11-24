/**
 * Localized, code-first transaction errors — Issue #292.
 *
 * Structured error codes (Soroban contract numbers, HTTP statuses, wallet
 * string codes) are detected from machine diagnostics and kept verbatim in
 * `code`. Human-facing `message`/`action` text is resolved from locale
 * resources. No control-flow decision is made from translated text, so a
 * translation change can never alter error classification or retry behavior.
 *
 * Category and retryability reuse the existing `classifyError` contract so
 * this module does not fork its financial-safety decisions. Raw diagnostics
 * are never interpolated into user-facing strings; unknown codes resolve to a
 * generic localized message.
 */

import {
  classifyError,
  type AccessibleError,
  type ErrorCategory,
} from './errorMessages';
import {
  resolveTransactionMessage,
  type TransactionLocale,
} from './transactionLocale';
import type { DiagnosticDetails } from './transactionErrorRecovery';

export interface LocalizedTransactionError {
  /** Stable machine-readable code (e.g. `CONTRACT_401`, `HTTP_429`, `USER_DECLINED`). */
  code: string;
  category: ErrorCategory;
  isRetryable: boolean;
  message: string;
  action: string;
  fieldId?: string;
  safeValues?: Record<string, string>;
}

const WALLET_STRING_CODES = [
  'USER_DECLINED',
  'NETWORK_TIMEOUT',
  'RATE_LIMITED',
  'WALLET_CONTEXT_CHANGED',
  'SESSION_EXPIRED',
  'WALLET_DISCONNECTED',
] as const;

const HTTP_STATUSES = [
  400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504,
] as const;

const HTTP_MESSAGE_KEYS: Readonly<Record<number, string>> = {
  400: 'transaction.errors.api.validation',
  401: 'transaction.errors.api.unauthorized',
  403: 'transaction.errors.api.unauthorized',
  404: 'transaction.errors.api.unknown',
  409: 'transaction.errors.api.server',
  422: 'transaction.errors.api.validation',
  429: 'transaction.errors.api.rate_limited',
  500: 'transaction.errors.api.server',
  502: 'transaction.errors.api.network',
  503: 'transaction.errors.api.network',
  504: 'transaction.errors.api.network',
};

/** Remediation keys stored as translated text in `transaction.errors.actions`. */
const ACTION_KEYS: Readonly<Record<string, string>> = {
  CONTRACT_102: 'no_action',
  CONTRACT_201: 'check_permissions',
  CONTRACT_202: 'check_permissions',
  CONTRACT_204: 'verify_form',
  CONTRACT_205: 'check_permissions',
  CONTRACT_203: 'no_action',
  CONTRACT_206: 'contact_support',
  CONTRACT_207: 'no_action',
  CONTRACT_208: 'contact_support',
  CONTRACT_301: 'reduce_amount',
  CONTRACT_302: 'reduce_amount',
  CONTRACT_303: 'retry_later',
  CONTRACT_304: 'retry_later',
  CONTRACT_306: 'retry_later',
  CONTRACT_307: 'retry_later',
  CONTRACT_308: 'verify_form',
  CONTRACT_309: 'check_permissions',
  CONTRACT_311: 'verify_form',
  CONTRACT_312: 'retry_later',
  CONTRACT_313: 'verify_form',
  CONTRACT_314: 'fund_wallet',
  CONTRACT_317: 'verify_form',
  CONTRACT_318: 'check_permissions',
  CONTRACT_319: 'contact_support',
  CONTRACT_320: 'retry_later',
  CONTRACT_321: 'retry_later',
  CONTRACT_401: 'fund_wallet',
  CONTRACT_402: 'no_action',
  CONTRACT_403: 'check_connection',
  CONTRACT_404: 'retry',
  CONTRACT_501: 'verify_request_id',
  CONTRACT_502: 'wait_for_lock',
  CONTRACT_503: 'retry_later',
  CONTRACT_504: 'retry',
  CONTRACT_601: 'verify_request_id',
  CONTRACT_602: 'wait_for_lock',
  CONTRACT_603: 'wait_for_lock',
  CONTRACT_605: 'retry_later',
  CONTRACT_606: 'verify_request_id',
  CONTRACT_607: 'retry_later',
  CONTRACT_703: 'adjust_slippage',
  CONTRACT_704: 'adjust_slippage',
  CONTRACT_705: 'retry_later',
  CONTRACT_706: 'retry_later',
  CONTRACT_707: 'retry_later',
  CONTRACT_708: 'retry_later',
  CONTRACT_709: 'contact_support',
  CONTRACT_710: 'reduce_amount',
  CONTRACT_803: 'retry',
  CONTRACT_901: 'sync_nonce',
  CONTRACT_902: 'sync_nonce',
  CONTRACT_1001: 'reduce_amount',
  CONTRACT_1101: 'check_permissions',
  CONTRACT_1102: 'check_permissions',
  CONTRACT_1103: 'check_permissions',
  CONTRACT_1104: 'verify_request_id',
  CONTRACT_1105: 'no_action',
  CONTRACT_1106: 'no_action',
  CONTRACT_1107: 'check_permissions',
  CONTRACT_1108: 'check_permissions',
  CONTRACT_1201: 'no_action',
  CONTRACT_1202: 'verify_request_id',
  CONTRACT_1203: 'wait_for_lock',
  HTTP_400: 'verify_form',
  HTTP_401: 'reconnect_wallet',
  HTTP_403: 'check_permissions',
  HTTP_404: 'verify_request_id',
  HTTP_409: 'retry',
  HTTP_422: 'verify_form',
  HTTP_429: 'retry_later',
  HTTP_500: 'generic',
  HTTP_502: 'check_connection',
  HTTP_503: 'check_connection',
  HTTP_504: 'check_connection',
  USER_DECLINED: 'retry',
  NETWORK_TIMEOUT: 'check_connection',
  RATE_LIMITED: 'retry_later',
  WALLET_CONTEXT_CHANGED: 'check_permissions',
  SESSION_EXPIRED: 'reconnect_wallet',
  WALLET_DISCONNECTED: 'reconnect_wallet',
  UNKNOWN: 'generic',
};

export interface LocalizeErrorOptions {
  locale?: TransactionLocale;
  httpStatus?: number;
  fieldId?: string;
  safeValues?: Record<string, string>;
}

function contractCodeFrom(raw: string): string | null {
  const tagged = raw.match(/(?:Error\(|code\s+)(\d{3,4})\)?/i);
  const bare = tagged ?? raw.match(/\b([1-9]\d{2,3})\b/);
  return bare ? `CONTRACT_${Number(bare[1])}` : null;
}

/**
 * Detects a stable code from machine diagnostics. HTTP hints win first, then
 * explicit wallet/contract codes, then conservative semantic keywords. The
 * translated message is never inspected.
 */
export function detectTransactionErrorCode(
  error: unknown,
  options: Pick<LocalizeErrorOptions, 'httpStatus'> = {},
): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  const { httpStatus } = options;

  if (
    httpStatus !== undefined &&
    (HTTP_STATUSES as readonly number[]).includes(httpStatus)
  ) {
    return `HTTP_${httpStatus}`;
  }

  for (const code of WALLET_STRING_CODES) {
    if (raw.includes(code) || lower.includes(code.toLowerCase())) return code;
  }

  const contractCode = contractCodeFrom(raw);
  if (contractCode) return contractCode;

  if (lower.includes('user declined') || lower.includes('rejected'))
    return 'USER_DECLINED';
  if (
    lower.includes('session expired') ||
    lower.includes('session has expired')
  )
    return 'SESSION_EXPIRED';
  if (lower.includes('not connected') || lower.includes('disconnected'))
    return 'WALLET_DISCONNECTED';
  if (lower.includes('rate limit') || lower.includes('too many requests'))
    return 'RATE_LIMITED';
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('failed to fetch') ||
    lower.includes('network')
  )
    return 'NETWORK_TIMEOUT';
  if (lower.includes('unauthorized') || lower.includes('not authorized'))
    return 'HTTP_401';

  return 'UNKNOWN';
}

/** Bare Soroban codes are treated as contract codes by the resolver. */
function normalizeMachineCode(code: string): string {
  return /^\d{3,4}$/.test(code) ? `CONTRACT_${Number(code)}` : code;
}

/** Localized message for a machine code. Never contains raw diagnostics. */
export function messageForTransactionCode(
  code: string,
  locale: TransactionLocale = 'en',
): string {
  const machineCode = normalizeMachineCode(code);
  if (machineCode.startsWith('CONTRACT_')) {
    const numeric = machineCode.slice('CONTRACT_'.length);
    const key = `errors.${numeric}`;
    const resolved = resolveTransactionMessage(locale, key);
    if (resolved !== key) return resolved;
  } else if (machineCode.startsWith('HTTP_')) {
    const numeric = Number(machineCode.slice('HTTP_'.length));
    if (HTTP_MESSAGE_KEYS[numeric]) {
      return resolveTransactionMessage(locale, HTTP_MESSAGE_KEYS[numeric]);
    }
  } else if ((WALLET_STRING_CODES as readonly string[]).includes(machineCode)) {
    const walletKeys: Record<string, string> = {
      USER_DECLINED: 'transaction.errors.wallet.user_declined',
      NETWORK_TIMEOUT: 'transaction.errors.api.network',
      RATE_LIMITED: 'transaction.errors.api.rate_limited',
      WALLET_CONTEXT_CHANGED: 'transaction.errors.wallet.context_changed',
      SESSION_EXPIRED: 'transaction.errors.wallet.session_expired',
      WALLET_DISCONNECTED: 'transaction.errors.wallet.disconnected',
    };
    return resolveTransactionMessage(locale, walletKeys[machineCode]);
  }

  return resolveTransactionMessage(
    locale,
    'transaction.errors.unknown.message',
  );
}

/** Localized remediation for a machine code. */
export function actionForTransactionCode(
  code: string,
  locale: TransactionLocale = 'en',
): string {
  const machineCode = normalizeMachineCode(code);
  const key = ACTION_KEYS[machineCode] ?? 'generic';
  if (
    machineCode.startsWith('CONTRACT_') &&
    ACTION_KEYS[machineCode] === undefined
  ) {
    // Unlisted contract codes still get a safe, localized next step.
    return resolveTransactionMessage(
      locale,
      'transaction.errors.actions.contact_support',
    );
  }
  return resolveTransactionMessage(locale, `transaction.errors.actions.${key}`);
}

/**
 * Recovery panel messages use the legacy diagnostic code set (1001-1008 and
 * wallet string codes) from `transactionErrorRecovery.ts`. Keeping them in a
 * separate resource namespace avoids colliding with the current Soroban codes
 * (for example, 1001 means "below minimum" on-chain but "insufficient funds"
 * in the recovery module).
 */
export function messageForDiagnosticCode(
  code: string,
  locale: TransactionLocale = 'en',
): string {
  const key = `transaction.errors.recovery.${code}.message`;
  const resolved = resolveTransactionMessage(locale, key);
  if (resolved !== key) return resolved;
  return messageForTransactionCode(code, locale);
}

/** Localized remediation for a diagnostic code. */
export function actionForDiagnosticCode(
  code: string,
  locale: TransactionLocale = 'en',
): string {
  const key = `transaction.errors.recovery.${code}.action`;
  const resolved = resolveTransactionMessage(locale, key);
  if (resolved !== key) {
    return resolveTransactionMessage(
      locale,
      `transaction.errors.actions.${resolved}`,
    );
  }
  return actionForTransactionCode(code, locale);
}

/**
 * Classifies an error into a stable code and resolves all user-facing text in
 * the requested locale. Existing `classifyError` behavior supplies category,
 * retryability and field association; this wrapper only replaces the strings.
 */
export function classifyLocalizedError(
  error: unknown,
  options: LocalizeErrorOptions = {},
): LocalizedTransactionError {
  const { locale = 'en', httpStatus, fieldId, safeValues } = options;
  const code = detectTransactionErrorCode(error, { httpStatus });
  // Unknown codes stay unknown: do not let a keyword in raw diagnostics
  // silently acquire a known category while the code remains UNKNOWN.
  const baseline: AccessibleError =
    code === 'UNKNOWN'
      ? { ...classifyError(null), fieldId, safeValues }
      : classifyError(error, { httpStatus, fieldId, safeValues });

  return {
    code,
    category: baseline.category,
    isRetryable: baseline.isRetryable,
    message: messageForTransactionCode(code, locale),
    action: actionForTransactionCode(code, locale),
    fieldId: baseline.fieldId,
    safeValues: baseline.safeValues,
  };
}

/**
 * Replaces the English `safeMessage`/`actionGuidance` on a diagnostic object
 * using its existing machine `errorCode`. The code, correlation ID, category,
 * retryability and timestamp are preserved unchanged.
 */
export function localizeDiagnostics(
  diagnostics: DiagnosticDetails,
  locale: TransactionLocale = 'en',
): DiagnosticDetails {
  const rawCode = diagnostics.errorCode;
  const code =
    rawCode === undefined || rawCode === null
      ? 'UNKNOWN_ERROR'
      : String(rawCode);

  return {
    ...diagnostics,
    safeMessage: messageForDiagnosticCode(code, locale),
    actionGuidance: actionForDiagnosticCode(code, locale),
  };
}
