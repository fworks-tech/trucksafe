/** Human-readable route names. Backend ids stay in data attributes only. */
export function routeLabelsById(
  routes: readonly { id: string }[],
): Record<string, string> {
  const labels: Record<string, string> = {};
  routes.forEach((route, index) => {
    labels[route.id] = `Route ${index + 1}`;
  });
  return labels;
}
