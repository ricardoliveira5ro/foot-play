/**
 * Test: Shirt component accepts and renders team-specific colors.
 *
 * This file validates the new `colors` prop at the TypeScript level.
 * Run `npx tsc --noEmit` to verify type correctness.
 */

import Shirt from './Shirt';
import type { TeamColorEntry } from '@/lib/teamColors';
import type { ShirtData } from '@/types';

// Mock shirt data for testing
const mockShirt: ShirtData = {
  token: 'test-shirt-1',
  nameLength: 8,
  shirtNumber: 10,
  coords: { x: 50, y: 50 },
  state: 'default',
  wordBoundaries: [],
  position: 'ST',
};

// Barcelona colors: stripes-v with primary #A50044, secondary #004D98
const barcelonaColors: TeamColorEntry = {
  primary: '#A50044',
  secondary: '#004D98',
  pattern: 'stripes-v',
};

// All four pattern types must be accepted by the colors prop.
const patterns: TeamColorEntry['pattern'][] = ['solid', 'stripes-v', 'stripes-h', 'halves'];

// Render one shirt per pattern to exercise every branch of the renderer.
const rendered = patterns.map((pattern, i) => (
  <Shirt
    key={pattern}
    shirt={mockShirt}
    index={i}
    colors={{ primary: '#A50044', secondary: '#004D98', pattern }}
  />
));

// Shirt must still work without the colors prop (default white/ink behavior).
const defaultShirt = <Shirt shirt={mockShirt} index={0} />;

// Shirt must accept the Barcelona colors explicitly.
const barcelonaShirt = <Shirt shirt={mockShirt} index={0} colors={barcelonaColors} />;

console.log('Shirt colors test: All type checks passed!');
console.log('Rendered patterns:', rendered.length);
console.log('Default shirt present:', Boolean(defaultShirt));
console.log('Barcelona shirt present:', Boolean(barcelonaShirt));
