/**
 * Allowed backend IDs
 *
 * Backends populate their own object with allowed identifiers,
 * ie. each backend should have an "allowed" object in their params.js
 * configuration file
 *
 * If the allowed list is empty then the backend accepts all client ids
 *
 * The example demo_backend below allows clients:
 * 'web_client' and 'backend_client'
 */
var allowed = {
  demo_backend: ['web_client', 'backend_client'],
};

module.exports = allowed;
