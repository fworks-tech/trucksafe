import { Grid2 as Grid, Typography } from '@mui/material';

import type { RoutePayload } from '../../features/route-planning/types';
import { RouteCard } from './RouteCard';

interface RouteComparisonProps {
  routes: RoutePayload[];
  recommendedRouteId: string | null;
}

/** Side-by-side route alternatives; vertical stack on small screens. */
export function RouteComparison({
  routes,
  recommendedRouteId,
}: RouteComparisonProps): React.JSX.Element {
  return (
    <section aria-label="Route alternatives">
      <Typography variant="h2" component="h2" gutterBottom>
        Route alternatives ({routes.length})
      </Typography>
      <Grid container spacing={2}>
        {routes.map((route) => (
          <Grid key={route.id} size={{ xs: 12, md: 4 }}>
            <RouteCard route={route} recommended={route.id === recommendedRouteId} />
          </Grid>
        ))}
      </Grid>
    </section>
  );
}
