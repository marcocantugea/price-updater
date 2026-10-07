/**
 * Frontend runtime configuration.
 *
 * `apiUrl` points at the Express API (src/backend/prices-api). The API enables
 * CORS with credentials for this origin so the HttpOnly refresh cookie works.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1'
};
