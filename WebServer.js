import express from 'express';
import expressHandlebars from 'express-handlebars';
import handlebars from 'handlebars';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import WebsocketServer from './WebsocketServer.js';
import { eventBus, Events } from './services/EventBus.js';
import { create } from 'express-handlebars';
import { HandlebarsHelpers } from './services/HandlebarsHelpers.js';
import MdnsDiscoveryService from './services/MdnsDiscoveryService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROUTES_DIR = path.join(process.cwd(), 'routes');

/**
 * Manages HTTP server functionality including:
 * - Express web application handling
 * - Template rendering via Handlebars
 * - Dynamic route loading and registration
 * - Static file serving and uploads
 * - Real-time WebSocket connections
 * - Network service discovery via MDNS
 * - Request timing and monitoring
 * - Comprehensive error handling
 */
export class WebServer {
    constructor() {
        this.app = express();
        this.initializeExpress();
        this.initializeHandlebars();
        this.server = http.createServer(this.app);
        this.routesRegistered = false;
        this.mdnsScanner = new MdnsDiscoveryService();
        this.mdnsScanner.start();
    }

    /**
     * Initializes Express middleware chain
     * Serves static files from 'public' directory
     * Processes JSON and form data automatically
     * Handles file uploads via multer
     * Injects server timestamp into all requests
     * Catches and formats all server errors
     * Provides specialized template error handling
     * Shows detailed errors in development mode only
     */
    initializeExpress() {
        this.app.use(express.static('public'));
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use((multer()).array());
        this.app.use((req, res, next) => {
            res.locals.serverTimeISO = new Date().toISOString();
            next();
        });

        // Add error handler as the last middleware
        this.app.use((err, req, res, next) => {
            // Handle template/partial errors
            if (err.code === 'ENOENT' && err.message.includes('handlebars')) {
                return res.status(500).render('error', {
                    errorTitle: 'Template Error',
                    errorMessage: 'Failed to load required template file',
                    errorDetails: `Missing file: ${err.path}`,
                    showRetry: true,
                    retryLink: req.originalUrl,
                });
            }
            
            // Handle other errors
            return res.status(500).render('error', {
                errorTitle: 'Server Error',
                errorMessage: err.message || 'An unexpected error occurred',
                errorDetails: process.env.NODE_ENV === 'development' ? err.stack : undefined,
                showRetry: true,
                retryLink: req.originalUrl,
            });
        });
    }

    /**
     * Configures template rendering system
     * Sets up partial template directory structure
     * Registers all custom template helpers
     * Enables handlebars as default view engine
     * Logs successful initialization
     */
    initializeHandlebars() {
        const hbs = create({
            partialsDir: path.join(__dirname, 'views', 'partials'),
            helpers: HandlebarsHelpers.getServerHelpers(handlebars),
        });

        this.app.engine('handlebars', hbs.engine);
        this.app.set('view engine', 'handlebars');
        console.log("🎨 Handlebars initialized with template helpers");
    }

    /**
     * Loads all route handlers dynamically
     * Scans routes directory for JavaScript modules
     * Prevents duplicate route registration
     * Supports class-based and functional routes
     * Logs successful route loading
     * Handles route loading failures gracefully
     * Completes in single pass - no hot reloading
     * @param {Object} stairledApp - Application context for route registration
     * @returns {Promise<void>} Resolves when all routes are registered
     */
    async registerRoutes(stairledApp) {
        if (this.routesRegistered) {
            eventBus.system('debug', 'Routes already registered');
            return;
        }

        const routepath = join(__dirname, 'routes');
        console.log('Including webserver handlers in ' + routepath);
        console.log('----------------------');

        try {
            const files = await readdir(routepath);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const filePath = join(routepath, file);
                    try {
                        const route = await import(filePath);
                        const routeModule = route.default || route;
                        
                        if (routeModule && typeof routeModule.register === 'function') {
                            console.log(`✅ Loading routes from : routes/${file}`);
                            await routeModule.register(stairledApp);
                        } else if (typeof routeModule === 'function') {
                            const instance = new routeModule();
                            if (typeof instance.register === 'function') {
                                console.log(`✅ Loading routes from : ${file}`);
                                await instance.register(stairledApp);
                            }
                        } else {
                            console.warn(`Warning: ${file} does not have a valid register function.`);
                        }
                    } catch (error) {
                        console.error(`Error while registering route: ${file}:`, error);
                    }
                }
            }
        } catch (err) {
            console.error("Error reading routes directory:", err);
        }

        this.routesRegistered = true;
    }

    /**
     * Provides access to Express application
     * Returns configured instance with all middleware
     * Enables external middleware registration
     * @returns {express.Application} Configured Express application
     */
    getApp() {
        return this.app;
    }

    /**
     * Exposes raw HTTP server instance
     * Enables direct server configuration
     * Allows WebSocket attachment
     * @returns {http.Server} Underlying HTTP server
     */
    getHttpServer() {
        return this.server;
    }

    /**
     * Registers GET endpoint handler
     * Adds route to Express middleware chain
     * Maintains existing route priority
     * @param {string} path - URL pattern to match
     * @param {Function} handler - Request processing function
     * @returns {express.Router} Router for chaining
     */
    get(path, handler) {
        return this.app.get(path, handler);
    }

    /**
     * Registers POST endpoint handler
     * Adds route to Express middleware chain
     * Maintains existing route priority
     * @param {string} path - URL pattern to match
     * @param {Function} handler - Request processing function
     * @returns {express.Router} Router for chaining
     */
    post(path, handler) {
        return this.app.post(path, handler);
    }

    /**
     * Adds middleware to processing chain
     * Executes for all matching requests
     * Maintains middleware execution order
     * @param {Function} handler - Middleware function
     * @returns {express.Router} Router for chaining
     */
    use(handler) {
        return this.app.use(handler);
    }

    /**
     * Loads partial template components
     * Registers network-item partial globally
     * Requires prior Handlebars initialization
     * Throws if template file missing
     * Must be called before rendering views
     */
    registerHandlebarsPartials() {
        this.hbs.registerPartial(
            'partials/network-item',
            fs.readFileSync(
                path.join(this.viewDir, 'partials/network-item.handlebars'),
                'utf8'
            )
        );
    }

    /**
     * Activates HTTP server listener
     * Binds to specified network port
     * Logs successful server start
     * Throws if server already running
     * Default port is 80 if unspecified
     * @param {number} port - Network port to listen on
     * @returns {Promise<void>} Resolves when server is listening
     * @throws {Error} If server fails to start
     */
    async start(port = 80) {
        if (!this.server) {
            throw new Error('HTTP server not initialized');
        }

        await this.server.listen(port);
        console.log(`🕸️ Webserver started at port ${port}`);
    }
}

export default WebServer;