// Canonical production domain for this site:
// https://terapixel.games
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://terapixel.games',
  integrations: [tailwind()],
  output: 'static'
});