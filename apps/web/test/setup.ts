import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The map section is lazily imported; a cold transform of maplibre-gl can
// exceed the default 1s polling window on slow environments.
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanup();
});
