/** Versioned persistence for the guided tour.
 *
 * Only the tour state ('completed' | 'dismissed') is stored — never trip
 * input. Unknown or missing values behave as first visit, so stale
 * storage can never break the tour.
 */

const STATE_KEY = 'trucksafe.guided-tour.v1.state';

export type TourPersistedState = 'completed' | 'dismissed';

export function readTourState(): TourPersistedState | null {
  try {
    const value = window.localStorage.getItem(STATE_KEY);
    return value === 'completed' || value === 'dismissed' ? value : null;
  } catch {
    // Private mode etc: the tour still works, it just never persists.
    return null;
  }
}

export function writeTourState(state: TourPersistedState): void {
  try {
    window.localStorage.setItem(STATE_KEY, state);
  } catch {
    // Ignore persistence failures; the tour itself is unaffected.
  }
}
