/**
 * One-shot probe for /api/stats/me, called at app boot. The result is
 * cached in module memory so components can decide synchronously
 * whether to render the Stats nav link.
 */
import { getMe, StatsForbiddenError } from './stats';

let cached: boolean | null = null;

export async function probeStatsAccess(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await getMe();
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
