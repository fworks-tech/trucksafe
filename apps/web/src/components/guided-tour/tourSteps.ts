/** Step catalog for the interactive guided product tour.
 *
 * Copy describes only implemented behavior: RHF form with quick examples,
 * departure-driven checkpoint ETAs, load in pounds, 10/25/50-mile
 * sampling, the (severe, high, average, duration) ranking key, and the
 * 0-48h forecast slider. No step names raw backend fields.
 */

export interface TourStep {
  id: string;
  /** `data-tour` anchor; null renders a centered dialog. */
  target: string | null;
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
      body: 'This tour walks through planning a truck trip, comparing weather-aware route alternatives, and picking the recommended option. About three minutes.',
      requiresResults: false,
      offerExample: false,
    },
    {
      id: 'places',
      target: 'origin-input',
      title: 'Origin and destination',
      body: 'Enter where the trip starts and ends — these locations generate the route alternatives. The quick-example chips above fill in Chicago to Dallas or Phoenix to Denver without submitting anything.',
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
      body: 'Enter the load in pounds — for example 30000. Heavier loads raise the severity of high-wind risk through the load rules.',
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
      body: 'Submit the trip to generate alternatives with distance, duration, weather, and risk analysis. Nothing happens until you act — use the example trip below, or press Plan route yourself.',
      requiresResults: false,
      offerExample: true,
    },
    {
      id: 'results',
      target: 'route-results',
      title: 'Route alternatives',
      body: 'Compare routes by distance, duration, and weather risk. TruckSafe recommends the route with fewer Severe miles, then fewer High miles, then lower average risk, then shorter travel time. Raw ranking numbers stay under Technical details.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'map',
      target: 'route-map',
      title: 'Routes and checkpoints',
      body: mockMode
        ? 'The map shows each alternative and its weather checkpoints; selecting a route updates the panel. This plan uses demonstration geometry — straight corridors, not real roads.'
        : 'The map shows each alternative and its weather checkpoints; selecting a route updates the panel. These routes follow the road network.',
      requiresResults: true,
      offerExample: false,
    },
    {
      id: 'risk',
      target: 'route-cards',
      title: 'Risk details and arrival times',
      body: 'Each card summarizes a route\u2019s weather risk. Expand Checkpoints on a card to see every checkpoint\u2019s arrival time, risk level, and the reason behind it.',
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
      body: 'Plan a trip, compare weather-aware alternatives, inspect checkpoints and the forecast, and choose the safest option for the load and conditions.',
      requiresResults: false,
      offerExample: false,
    },
  ];
}
