import { HandlebarsHelpers } from "../services/HandlebarsHelpers.js";

/**
 * API Route Handler managing:
 * - MDNS device discovery endpoints
 * - Handlebars helper script delivery
 * - RESTful endpoint registration
 * - Web server route configuration
 */
class API {
    constructor() {
    }

    /**
     * Registers all API routes with the web server
     * Configures endpoint handlers for MDNS and Handlebars
     * Sets up proper response types for each endpoint
     * @param {Express} app - Application instance with webServer and mdns components
     */
    register(app) {
        app.webServer.get('/mdns-discovery', (req, res) => this.handleMdnsDiscovery(app, req, res));
        app.webServer.get('/api/handlebars-helpers', (req, res) => this.handleHandlebarsHelpers(req, res));
    }

    /**
     * Handles MDNS device discovery requests
     * Returns JSON list of all discovered devices
     * @param {Express} app - Application instance containing mdns service
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    handleMdnsDiscovery(app, req, res) {
        const discoveredDevices = app.mdns.getDiscoveredDevices();
        res.json(discoveredDevices);
    }

    /**
     * Serves Handlebars helper functions as client-side script
     * Delivers JavaScript code for browser consumption
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    handleHandlebarsHelpers(req, res) {
        const helpers = HandlebarsHelpers.getClientHelpersScript();
        res.send(helpers);
    }
}

export default new API();
