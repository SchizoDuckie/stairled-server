/**
 * MQTT route and websocket handler management including:
 * - Web interface route handling
 * - WebSocket message queue management
 * - Real-time MQTT log streaming
 * - Configuration display
 */
class MQTT {
    constructor() {
        this.enabled = null;
    }

    /**
     * Initializes all MQTT-related routes and handlers
     * Sets up web interface and WebSocket endpoints
     * Attaches message queue management
     * @param {StairledApp} app - Main application instance
     */
    register(app) {
        app.webServer.get('/mqtt', (req, res) => this.handleMqttWebRoute(app, req, res));
        app.webSocketServer.addHandler('mqttlog', () => this.handleMqttLogWebSocket(app));

        console.log([
            "📨 MQTT Webserver route added", 
            "📨 MQTT Websocket listener attached."
        ].join("\n"));
    }

    /**
     * Handles web interface route for MQTT configuration
     * Renders MQTT configuration page with current settings
     * @param {StairledApp} app - Main application instance
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    handleMqttWebRoute(app, req, res) {
        res.render('mqtt', {
            'config': app.config.get('mqtt')
        });
    }

    /**
     * Manages WebSocket handler for MQTT message logging
     * Streams message queue contents
     * Clears queue after sending
     * @param {StairledApp} app - Main application instance
     * @returns {string} JSON stringified message queue
     */
    handleMqttLogWebSocket(app) {
        const messageQueue = app.mqttClient.getMessageQueue();
        const output = JSON.stringify(messageQueue);
        app.mqttClient.messageQueue = []; // Clear the queue after sending
        return output;
    }
}

export default new MQTT();
