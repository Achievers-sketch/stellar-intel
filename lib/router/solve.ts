/**
 * Core single-anchor solver for the intent router.
 *
 * Selects the best SEP-38 quote that meets the floor and deadline constraints.
 * Returns a deterministic plan or a typed error.
 */

import type { Intent, EvaluatedQuote, Plan, SolverResult } from '@/types'

/**
 * Compares two decimal strings numerically.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 * Handles scientific notation and leading zeros.
 */
function compareDecimals(a: string, b: string): number {
  const numA = parseFloat(a)
  const numB = parseFloat(b)
  if (numA < numB) return -1
  if (numA > numB) return 1
  return 0
}

/**
 * Checks if a quote meets the intent's minimum receive floor.
 * Compares the quote's buy_amount against the intent's minReceive.
 */
function meetsFloor(quote: EvaluatedQuote, intent: Intent): boolean {
  return compareDecimals(quote.buy_amount, intent.minReceive) >= 0
}

/**
 * Checks if the intent's deadline has passed.
 * Used to reject intents that are already expired or nearly expired.
 */
function isDeadlineExpired(deadline: string): boolean {
  const deadlineTime = new Date(deadline).getTime()
  return deadlineTime <= Date.now()
}

/**
 * Checks if a quote has expired based on its expires_at field.
 */
function isQuoteExpired(expiresAt: string): boolean {
  const expireTime = new Date(expiresAt).getTime()
  return expireTime <= Date.now()
}

/**
 * Selects the best single-anchor quote from a set of evaluated quotes.
 *
 * **Acceptance Criteria:**
 * - Returns the best qualified quote if one meets all constraints
 * - Skips anchors whose firm quote undercuts the floor
 * - Returns typed "no_eligible_route" error if no quote qualifies
 * - Returns "floor_not_met" if all quotes violate the minimum
 * - Returns "all_quotes_expired" if all quotes have expired
 *
 * **Selection Criteria (in order):**
 * 1. Reject quote if it has expired
 * 2. Reject quote if it doesn't meet the floor (minReceive)
 * 3. Among valid quotes, select the one with the highest buy_amount
 *
 * @param intent - The user's intent (includes minReceive floor and deadline)
 * @param evaluatedQuotes - Array of SEP-38 quotes already evaluated for eligibility
 * @returns A SolverResult: either a plan or a typed error
 */
export function solveSingleAnchor(
  intent: Intent,
  evaluatedQuotes: EvaluatedQuote[]
): SolverResult {
  // Check if the intent deadline has already passed
  if (isDeadlineExpired(intent.deadline)) {
    return {
      ok: false,
      error: 'all_quotes_expired',
      details: `Intent deadline ${intent.deadline} has already passed`,
    }
  }

  // Separate quotes by expiration and floor status
  const validQuotes: EvaluatedQuote[] = []
  const expiredQuotes: EvaluatedQuote[] = []
  const floorViolations: EvaluatedQuote[] = []

  for (const quote of evaluatedQuotes) {
    if (isQuoteExpired(quote.expires_at)) {
      expiredQuotes.push(quote)
    } else if (!meetsFloor(quote, intent)) {
      floorViolations.push(quote)
    } else {
      validQuotes.push(quote)
    }
  }

  // If no valid quotes exist, return an appropriate error
  if (validQuotes.length === 0) {
    // Special case: no quotes provided at all
    if (evaluatedQuotes.length === 0) {
      return {
        ok: false,
        error: 'no_eligible_route',
      }
    }

    if (expiredQuotes.length === evaluatedQuotes.length) {
      return {
        ok: false,
        error: 'all_quotes_expired',
        details: `All ${evaluatedQuotes.length} quote(s) have expired`,
      }
    }

    if (floorViolations.length > 0 && validQuotes.length === 0) {
      const insufficientAmounts = floorViolations
        .map((q) => `${q.anchorName}: ${q.buy_amount} < ${intent.minReceive}`)
        .join('; ')
      return {
        ok: false,
        error: 'floor_not_met',
        details: `No quotes meet minimum receive of ${intent.minReceive}. ${insufficientAmounts}`,
      }
    }

    return {
      ok: false,
      error: 'no_eligible_route',
    }
  }

  // Select the quote with the highest buy_amount (best for user)
  const bestQuote = validQuotes.reduce((best, current) => 
    compareDecimals(current.buy_amount, best.buy_amount) > 0 ? current : best
  )

  // Build and return the plan
  const plan: Plan = {
    type: 'single_anchor',
    anchorId: bestQuote.anchorId,
    anchorName: bestQuote.anchorName,
    quoteId: bestQuote.id,
    netAmount: bestQuote.buy_amount,
    fee: bestQuote.fee.total,
    price: bestQuote.price,
  }

  return {
    ok: true,
    plan,
  }
}

/**
 * Custom error type for solver failures.
 * Provides a typed interface for handling specific routing failures.
 */
export class NoEligibleRouteError extends Error {
  constructor(
    public code: 'no_eligible_route' | 'floor_not_met' | 'all_quotes_expired',
    message: string
  ) {
    super(message)
    this.name = 'NoEligibleRouteError'
  }
}

/**
 * Throws a NoEligibleRouteError if the SolverResult indicates failure.
 * Used to convert discriminated union results into exceptions for consumers
 * that prefer exception-based error handling.
 *
 * @param result - The SolverResult to check
 * @throws NoEligibleRouteError if result.ok === false
 * @returns The plan if result.ok === true
 */
export function throwIfNoRoute(result: SolverResult): Plan {
  if (result.ok) {
    return result.plan
  }

  const details = 'details' in result ? ` (${result.details})` : ''
  throw new NoEligibleRouteError(result.error, `${result.error}${details}`)
}
