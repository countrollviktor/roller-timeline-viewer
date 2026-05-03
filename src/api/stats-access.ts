/**
 * One-shot probe for /api/stats/me, called at app boot. The result is
 * cached in module memory so components can decide synchronously
 * whether to render the Stats nav link.
 *
 * Has a 5s timeout: if /api/stats/me hangs, we treat it as no-access
 * rather than blocking the entire app boot. The Stats link will simply
 * not appear; the user can still type /stats directly to see the
 * NotAuthorized page (or stats themselves if eventually allowed).
 */
import { getMe, StatsForbiddenError } from './stats';

let cached: boolean | null = null;
const PROBE_TIMEOUT_MS = 5000;

export async function probeStatsAccess(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('stats access probe timed out')), PROBE_TIMEOUT_MS),
    );
    await Promise.race([getMe(), timeoutPromise]);
    cached = true;
  } catch (err) {
    if (!(err instanceof StatsForbiddenError)) {
      console.warn('stats access probe failed:', err);
    }
    cached = false;
  }
  return cached;
}

export function getStatsAccess(): boolean {
  return cached === true;
}
