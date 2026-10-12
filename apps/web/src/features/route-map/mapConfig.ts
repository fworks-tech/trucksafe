/** Public map configuration.
 *
 * MapLibre GL JS renders against a style document. The default is the
 * public CARTO Positron style, which needs no token; attribute CARTO and
 * OpenStreetMap contributors when it is visible (the style carries its own
 * attribution control). `VITE_MAP_STYLE_URL` overrides the style for local
 * development. It is a public client-side value: never put secrets in it.
 * An explicitly empty value disables the map and shows the accessible
 * fallback instead.
 */

export const DEFAULT_MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** Configured style URL, or `''` when the map must stay disabled. */
export function mapStyleUrl(): string {
  const raw = import.meta.env['VITE_MAP_STYLE_URL'];
  if (typeof raw === 'string') return raw.trim();
  return DEFAULT_MAP_STYLE_URL;
}
