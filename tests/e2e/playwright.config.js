// Suite e2e del comparativo. Corre contra el index.html LOCAL del repo, servido
// por un http.server (no file://, para que las fotos del carrusel resuelvan igual
// que en Vercel).
//
// Usa el Chrome instalado en la máquina (channel: 'chrome') para no bajar
// navegadores: `npx playwright install` no hace falta.
const path = require('path');
const { defineConfig } = require('@playwright/test');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const PUERTO = 4173;

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    channel: 'chrome',
    headless: true,
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    command: `python3 -m http.server ${PUERTO} --bind 127.0.0.1 --directory "${RAIZ}"`,
    url: `http://127.0.0.1:${PUERTO}/index.html`,
    timeout: 15_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'celular', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
