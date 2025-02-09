import WebSocket from 'ws';
import http from 'http';

/**
 * Polyfill for older node versions
 */
if (!globalThis.performance?.now) {
  const startTime = process.hrtime();
  globalThis.performance = {
    now: function () {
      const diff = process.hrtime(startTime);
      return diff[0] * 1000 + diff[1] / 1e6; // Convert to milliseconds
    },
  };
}

/**
 * WebSocket server manager providing:
 * - Secure WebSocket connections over HTTP server
 * - Client connection tracking and management
 * - Message routing and topic-based handlers
 * - Broadcast capabilities
 * - Graceful shutdown handling
 * - Performance monitoring
 * - Error recovery and logging
 */
class WebsocketServer {
    /**
     * Creates WebSocket server instance
     * Initializes client tracking
     * Sets up message handlers
     * Prepares server state management
     */
    constructor() {
        this.wss = null;
        this.clients = new Set();
        this.handlers = new Map();
        this.isStarted = false;
    }

    /**
     * Starts the WebSocket server
     * Validates server instance
     * Configures WebSocket settings
     * Binds connection handlers
     * Prevents multiple starts
     * 
     * @param {http.Server} server - The HTTP server instance to attach to
     * @returns {WebsocketServer} - Returns this instance for method chaining
     * @throws {Error} If server is already started or invalid server instance
     */
    start(server) {
        if (this.isStarted) {
            console.warn('WebSocket server is already running');
            return this;
        }

        if (!(server instanceof http.Server)) {
            throw new Error('Invalid server instance provided');
        }

        try {
            this.wss = new WebSocket.Server({ 
                server,
                clientTracking: true,
                noServer: false
            });

            this.wss.on('connection', this.handleConnection.bind(this));
            this.wss.on('error', this.handleError.bind(this));
            
            this.isStarted = true;

            console.log('⚡ WebSocket server started');

            return this;
        } catch (error) {
            eventBus.system('error', 'Failed to start WebSocket server', error);
            throw error;
        }
    }

    /**
     * Handles WebSocket server errors
     * Logs error details with stack trace
     * 
     * @private
     * @param {Error} error - The error that occurred
     */
    handleError(error) {
        console.trace('WebSocket server error:', error);
    }

    /**
     * Manages new client connections
     * Adds client to tracking set
     * Sets up message and close handlers
     * Maintains client lifecycle
     * 
     * @param {WebSocket} ws - WebSocket client instance
     */
    handleConnection(ws) {
        this.clients.add(ws);
        ws.on('message', (msg) => this.handleMessage(msg, ws));
        ws.on('close', () => this.clients.delete(ws));
    }

    /**
     * Registers message topic handler
     * Maps topic to handler function
     * Enables method chaining
     * 
     * @param {string} topic - Message topic identifier
     * @param {Function} handler - Handler function for topic
     * @returns {WebsocketServer} Self reference for chaining
     */
    addHandler(topic, handler) {
        this.handlers.set(topic, handler);
        return this;
    }

    /**
     * Retrieves underlying WebSocket server instance
     * Provides access to raw server object
     * 
     * @returns {WebSocket.Server} WebSocket server instance
     */
    getWebSocketServer() {
        return this.wss;
    }

    /**
     * Processes incoming WebSocket messages
     * Splits multi-message batches
     * Routes to topic handlers
     * Measures processing performance
     * Handles errors per message
     * Returns responses to client
     * 
     * @param {string} msg - Raw message data
     * @param {WebSocket} client - Source client connection
     */
    handleMessage(msg, client) {
        const startTime = performance.now();
        const messages = msg.toString().split('\n');
       
        const responses = new Array();
        
        for (const message of messages) {
            if (!message.trim()) continue;
            const [topic, ...args] = message.split('|');
            const handler = this.handlers.get(topic);
            
            if (handler) {
                try {
                    const response = handler(...args);
                    if (response) responses.push(response);
                } catch (error) {
                    console.error(`❌ Error handling message '${topic}':`, error);
                    responses.push(`error|${topic}|${error.message}`);
                }
            } else {
                console.warn(`⚠️ Unknown topic '${topic}'. Available: ${[...this.handlers.keys()].join(', ')}`);
            }
        }
        
        if (responses.length > 0) {
            client.send(responses.join('\n'));
        }
        
        const duration = performance.now() - startTime;
       //console.log(`⚡ Processed batch in ${duration.toFixed(2)}ms (${(messages.length / duration * 1000).toFixed(2)} msgs/sec)`);
    }
    
    /**
     * Broadcasts message to all connected clients
     * Filters to only active connections
     * Handles message delivery failures
     * 
     * @param {string} message - Message to broadcast
     */
    broadcast(message) {
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    /**
     * Stops WebSocket server gracefully
     * Closes all client connections
     * Shuts down server instance
     * Cleans up resources
     * Logs shutdown progress
     * 
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isStarted) {
            return;
        }

        try {
            // Close all client connections
            for (const client of this.clients) {
                client.terminate();
            }
            this.clients.clear();

            // Close the server
            await this.closeServer();

            this.isStarted = false;
            this.wss = null;
            console.log('WebSocket server stopped');
        } catch (error) {
            eventBus.system('error', 'Error stopping WebSocket server:', error);
            throw error;
        }
    }

    /**
     * Closes the WebSocket server gracefully
     * Returns promise for shutdown completion
     * 
     * @private
     * @returns {Promise<void>} Resolves when server is closed
     * @throws {Error} If there's an error closing the server
     */
    async closeServer() {
        return new Promise((resolve, reject) => {
            this.wss.close(err => err ? reject(err) : resolve());
        });
    }
}

export default WebsocketServer;
