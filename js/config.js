// Where the frontend finds the API server. This is the only place to change it.
//
// Running locally (localhost, 127.0.0.1, or a file opened straight from disk),
// the API is the Express server on port 3000. Everywhere else, such as GitHub
// Pages, it's the server deployed on Render.
window.AppConfig = (function () {
  // TODO: replace with your Render URL, e.g. 'https://ootd-closet-api.onrender.com'
  // (no slash at the end).
  const PRODUCTION_API_BASE_URL = 'https://YOUR-RENDER-SERVICE.onrender.com';
  const LOCAL_API_BASE_URL = 'http://localhost:3000';

  const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const API_BASE_URL = isLocal ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL;

  /** Turns '/api/weather' into the full address of that endpoint. */
  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  return { API_BASE_URL, apiUrl };
})();
