/** Step catalog for the interactive guided product tour.
 *
 * Copy describes only implemented behavior: RHF form with quick examples,
 * departure-driven checkpoint ETAs, load in pounds, 10/25/50-mile
 * sampling, the (severe, high, average, duration) ranking key, and the
 * 0-48h forecast slider. No step names raw backend fields.
 */

export interface TourStep {
  id: string;
  /**
   * `data-tour` anchor(s); null renders a centered dialog. Multiple
   * anchors spotlight their bounding union (e.g. origin + destination).
   */
  target: string | readonly string[] | null;
  title: string;
  body: string;
  /** Needs a generated plan; otherwise a fallback dialog shows. */
  requiresResults: boolean;
  /** Offers the explicit example-trip action on this step. */
  offerExample: boolean;
}

export interface TourContext {
  hasResults: boolean;
  mockMode: boolean;
}

export function buildTourSteps(context: TourContext): TourStep[] {
  const { mockMode } = context;
  return [
    {
      id: 'welcome',
      target: null,
      title: 'Welcome to TruckSafe',
      body: 'Plan a truck trip, compare three routes shaped by the forecast, and pick the recommended one. This takes about three minutes.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'places',
      target: ['origin-input', 'destination-input'],
      title: 'Origin and destination',
      body: 'Enter where the trip starts and ends. Those two places decide which routes get planned. The example chips above fill in Chicago to Dallas or Phoenix to Denver, without submitting anything.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'departure',
      target: 'departure-input',
      title: 'Departure time',
      body: 'The departure time sets each checkpoint\u2019s estimated arrival time, which decides what weather the truck meets at that point.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'load',
      target: 'load-weight-input',
      title: 'Load weight',
      body: 'Enter the load in pounds, for example 30000. Weight only ever raises risk, never lowers it. Past 30,000 lb, winds of 45 to 54 mph mean No Travel; past 40,000 lb, 35 to 44 mph winds rate Severe. At 55 mph or more, no load goes out.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'interval',
      target: 'checkpoint-interval',
      title: 'Weather checkpoints',
      body: 'TruckSafe samples weather every 10, 25, or 50 miles along each route. Every checkpoint is evaluated at the truck\u2019s estimated arrival time.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'generate',
      target: 'generate-route',
      title: 'Generate a route plan',
      body: 'Submit the trip to get three alternatives with distance, duration, weather, and risk. Nothing runs until you say so. Use the example trip below, or press Plan route yourself.',
      requiresResults: false,
      offerExample: true,
    },
    {
      id: 'results',
      target: 'route-results',
      title: 'Route alternatives',
      body: 'Compare the three routes by distance, duration, and weather risk. TruckSafe recommends the one with the fewest Severe miles, then the fewest High miles, then the lowest average risk, then the shortest travel time. The exact ranking numbers live under Technical details.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'map',
      target: 'route-map',
      title: 'Routes and checkpoints',
      body: mockMode
        ? 'The map shows each alternative and its weather checkpoints, and selecting a route updates the panel. This plan uses demonstration geometry, so the lines are straight corridors instead of real roads.'
        : 'The map shows each alternative and its weather checkpoints, and selecting a route updates the panel. These routes follow the road network.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'risk',
      target: 'route-cards',
      title: 'Risk details and arrival times',
      body: 'Each card summarizes a route\u2019s weather risk. Expand Checkpoints on a card to see every checkpoint\u2019s arrival time, risk level, and the reason behind it. The bands behind those levels: wind Low below 25 mph, Moderate 25 to 34, High 35 to 44, Severe 45 to 54, No Travel at 55 or more; rain Low below 0.10 in/h, Moderate 0.10 to 0.25, High 0.25 to 0.50, Severe 0.50 to 1.00, No Travel above 1.00; snow Low below 0.5 in/h, Moderate 0.5 to 1.0, High 1.0 to 2.0, Severe 2.0 to 3.0, No Travel above 3.0.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'heatmap',
      target: 'heatmap-toggle',
      title: 'Weather heatmap',
      body: 'The cloud button toggles the heatmap, which paints forecast conditions along the route once forecast data loads. The map legend explains the risk colors.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'forecast',
      target: 'forecast-section',
      title: 'Forecast timeline',
      body: 'Expand Forecast and move the slider from 0 to 48 hours to see how conditions along the route change. The slider works with keyboard and touch.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'done',
      target: null,
      title: 'You are ready to use TruckSafe',
      body: 'Plan a trip, compare the three routes, check the checkpoints and the forecast, and pick the safest option for your load and conditions.',
      requiresResults: false,
      offerExample: false,
    },
  ];
}
