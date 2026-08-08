//#region src/retries.d.ts
/**
 * Retry options for schedule(), scheduleEvery(), queue(), and this.retry().
 */
interface RetryOptions {
  /** Max number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default: 100 */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default: 3000 */
  maxDelayMs?: number;
}
/**
 * Internal options for tryN -- extends RetryOptions with a shouldRetry predicate.
 */
interface TryNOptions extends RetryOptions {
  /**
   * Predicate to determine if an error should be retried.
   * Receives the error and the next attempt number (so callers can
   * make attempt-aware decisions).
   * If not provided, all errors are retried.
   */
  shouldRetry?: (err: unknown, nextAttempt: number) => boolean;
}
/**
 * Validate retry options eagerly so invalid config fails at enqueue/schedule time
 * rather than at execution time. Checks individual field ranges, enforces integer
 * maxAttempts, and validates cross-field constraints after resolving against
 * defaults when provided.
 */
declare function validateRetryOptions(
  options: RetryOptions,
  defaults?: Required<RetryOptions>
): void;
/**
 * Returns the number of milliseconds to wait before retrying a request.
 * Uses the "Full Jitter" approach from
 * https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 *
 * @param attempt The current attempt number (1-indexed).
 * @param baseDelayMs Base delay multiplier in ms.
 * @param maxDelayMs Maximum delay cap in ms.
 * @returns Milliseconds to wait before retrying.
 */
declare function jitterBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number;
/**
 * Retry an async function up to `n` total attempts with jittered exponential backoff.
 *
 * @param n Total number of attempts (must be a finite integer >= 1).
 * @param fn The async function to retry. Receives the current attempt number (1-indexed).
 * @param options Retry configuration.
 * @returns The result of `fn` on success.
 * @throws The last error if all attempts fail or `shouldRetry` returns false.
 */
declare function tryN<T>(
  n: number,
  fn: (attempt: number) => Promise<T>,
  options?: TryNOptions
): Promise<T>;
/**
 * Returns true if the given error is retryable according to Durable Object error handling.
 * See https://developers.cloudflare.com/durable-objects/best-practices/error-handling/
 *
 * An error is retryable if it has `retryable: true` but is NOT an overloaded error.
 */
declare function isErrorRetryable(err: unknown): boolean;
/**
 * Whether an error (or anything in its `cause` chain) is a transient
 * "superseded isolate" failure — see `SUPERSEDED_ISOLATE_PATTERN`. In-process
 * retries are futile for this class; the work must be deferred to a fresh
 * invocation, which runs the new code and succeeds.
 */
declare function isDurableObjectCodeUpdateReset(error: unknown): boolean;
/**
 * Whether an error (or anything in its `cause` chain) carries the exact
 * Durable Object storage-reset platform fragment. Generic SQL/internal errors
 * deliberately do not qualify.
 */
declare function isDurableObjectStorageReset(error: unknown): boolean;
/**
 * Whether an error (or anything in its `cause` chain, or a raw error-message
 * string) is a Durable Object memory-limit reset — see
 * {@link MEMORY_LIMIT_RESET_PATTERN}. Unlike {@link isPlatformTransientError},
 * re-running the same work re-OOMs deterministically, so callers must NOT defer
 * it like a transient; they should bound retries tightly and then seal (#1825).
 */
declare function isDurableObjectMemoryLimitReset(error: unknown): boolean;
/**
 * Whether an error (or anything in its `cause` chain) is a transient failure
 * of the PLATFORM rather than of the code that threw it:
 *
 *   - a superseded-isolate reset ("reset because its code was updated" /
 *     "this script has been upgraded") — a deploy replaced the isolate;
 *   - an error the platform itself flags `retryable: true` (excluding
 *     overloaded errors, where retrying the same object won't help) — see
 *     `isErrorRetryable`;
 *   - "Network connection lost." — the storage/stub connection dropped. The
 *     CF `retryable` flag does not survive error wrappers (e.g. `SqlError`
 *     copies only the message + `cause`) and is absent in some local-dev
 *     shapes, so the verbatim message is matched as well;
 *   - the exact "Internal error in Durable Object storage caused object to be
 *     reset" platform fragment. Generic internal and SQL errors remain fatal.
 *
 * Used to decide whether failed work should be RE-RUN LATER (platform
 * transient — the same work succeeds once the platform recovers, typically
 * seconds after a deploy) versus ABANDONED as genuinely failing (application
 * error — re-running yields the same failure). A genuine application error
 * carries none of these signals, so it is never misclassified by this check.
 */
declare function isPlatformTransientError(error: unknown): boolean;
//#endregion
export {
  isErrorRetryable as a,
  tryN as c,
  isDurableObjectStorageReset as i,
  validateRetryOptions as l,
  isDurableObjectCodeUpdateReset as n,
  isPlatformTransientError as o,
  isDurableObjectMemoryLimitReset as r,
  jitterBackoff as s,
  RetryOptions as t
};
//# sourceMappingURL=retries-CAvxtG9d.d.ts.map
