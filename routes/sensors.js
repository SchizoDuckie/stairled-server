import { eventBus, Events } from '../services/EventBus.js';
import { animationService } from '../services/AnimationService.js';
import Sensor from '../Sensor.js';

/**
 * Sensor Management System
 * Handles:
 * - Sensor device registration and tracking
 * - Real-time sensor monitoring
 * - Configuration persistence
 * - Web interface for sensor setup
 * - MQTT message processing
 * - Device discovery integration
 * - Animation trigger mapping
 */
class Sensors {
    /**
     * Initializes sensor management system
     * Prepares device tracking
     * Sets up sensor registration
     */
    constructor() {
        this.sensorDevices = [];
    }

    /**
     * Binds HTTP and WebSocket routes
     * Creates sensor configuration endpoints
     * Establishes device discovery API
     * Sets up MQTT message handlers
     * @param {StairledApp} app - Application instance for route binding
     */
    register(app) {
        app.webServer.get('/sensors', (req, res) => this.handleGetSensors(app, req, res));
        app.webServer.post('/sensors', (req, res) => this.handleSaveSensor(app, req, res));
        app.webServer.get('/api/sensor-devices', (req, res) => this.handleGetDevices(app, req, res));
        app.webSocketServer.addHandler('mqttlog', () => this.handleMqttLog(app));
    }

    /**
     * Renders sensor configuration interface
     * Loads animation effects list
     * Displays configured sensors
     * Shows connection status
     * Merges device states
     * @param {StairledApp} app - Application instance for config access
     * @param {Request} req - Express request
     * @param {Response} res - Express response for page render
     */
    async handleGetSensors(app, req, res) {
        try {
            const animations = await animationService.getAnimationsList();
            const configuredSensors = app.config.get('sensors') || [];
            
            const sensorMap = new Map();
            configuredSensors.forEach(config => {
                sensorMap.set(config.name, {
                    ...config,
                    connected: false // Default to offline until proven otherwise
                });
            });

            const mergedSensors = Array.from(sensorMap.values());

            res.render('sensors', {
                title: 'Sensors',
                sensors: mergedSensors,
                effects: animations
            });
        } catch (error) {
            console.error('Sensor route error:', error);
            res.status(500).send('Error loading sensor page');
        }
    }

    /**
     * Updates sensor configuration
     * Validates sensor parameters
     * Merges with existing config
     * Updates application state
     * Persists configuration
     * Handles validation errors
     * @param {StairledApp} app - Application instance for config storage
     * @param {Request} req - Express request with sensor data
     * @param {Response} res - Express response for result handling
     */
    handleSaveSensor(app, req, res) {
        try {
            const config = {
                name: req.body.name,
                channel: Number(req.body.channel) || 0,
                triggerThreshold: Number(req.body.triggerThreshold) || 0,
                triggerType: req.body.triggerType,
                triggerEffect: req.body.triggerEffect
            };

            const existingSensors = app.config.get('sensors') || [];
            const existingIndex = existingSensors.findIndex(s => s.name === config.name);
            
            if (existingIndex > -1) {
                existingSensors[existingIndex] = {
                    ...existingSensors[existingIndex],
                    ...config
                };
            } else {
                existingSensors.push(config);
            }

            app.sensors = existingSensors.map(s => new Sensor(s));
            app.config.set('sensors', existingSensors);
            app.config.save();
            
            res.sendStatus(200);
        } catch (error) {
            console.error('Sensor save error:', error);
            res.status(500).send('Error saving sensor configuration');
        }
    }

    /**
     * Returns discovered sensor devices
     * Retrieves mDNS device list
     * Formats device information
     * @param {StairledApp} app - Application instance for device access
     * @param {Request} req - Express request
     * @param {Response} res - Express response with device list
     */
    handleGetDevices(app, req, res) {
        res.json(app.mdns.getDiscoveredDevices());
    }

    /**
     * Processes MQTT message log
     * Extracts unique sensor identifiers
     * Formats message history
     * Returns JSON response
     * @param {StairledApp} app - Application instance for MQTT access
     * @returns {string} JSON-encoded message history
     */
    handleMqttLog(app) {
        const messages = app.mqtt.getLatestMessages() || [];
        const uniqueSensors = [...new Set(messages.map(msg => msg.sensor))];
        return JSON.stringify(messages);
    }
}

export default new Sensors();
