// Canonical production domain for this site:
// https://www.terapixel.games
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://www.terapixel.games',
  integrations: [tailwind()],
  output: 'static'
});
