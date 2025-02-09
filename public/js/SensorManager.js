/**
 * Manages sensor connectivity and data flow including:
 * - WebSocket communication with backend
 * - Sensor device discovery and registration
 * - Connection status monitoring
 * - Real-time data visualization updates
 * - Automatic refresh cycles (5s device scan, 150ms data polling)
 */
class SensorManager {
    /**
     * Initializes sensor management system
     * - Sets up existing sensor cards
     * - Establishes WebSocket connection
     * - Starts periodic device refresh (5s interval)
     * - Begins data point collection cycle (150ms initial)
     * @param {Object[]} sensors - Preconfigured sensor devices
     */
    constructor(sensors) {
        this.sensors = sensors;
        this.initializeExistingCards(sensors);
        this.setupWebSocket();
        
        setInterval(this.refreshSensorDevices.bind(this), 5000);
        setTimeout(this.getChartDataPoint.bind(this), 150);
    }

    /**
     * Creates sensor cards from existing DOM elements
     * - Finds all elements with data-sensor-name attribute
     * - Reuses existing elements to prevent duplicates
     * - Initializes SensorConfigCard for each found element
     * @param {Object[]} sensors - Sensor configurations to match
     */
    initializeExistingCards(sensors) {
        document.querySelectorAll('.sensor-card[data-sensor-name]').forEach(element => {
            const name = element.dataset.sensorName;
            let card = new SensorConfigCard({

                name,
                effects: window.effects,
                config: this.sensors.find(s => s.name === name) || {},
                element
            });
            card.render();
        });
    }

    /**
     * Establishes WebSocket connection with error handling
     * - Configures message/error/close handlers
     * - Implements automatic reconnection on close
     * - Uses bind() to maintain class context
     */
    setupWebSocket() {
        this.socket = new WebSocket(`ws://${window.location.host}/ws`);
        this.socket.onmessage = this.handleSocketMessage.bind(this);
        this.socket.onerror = this.handleSocketError.bind(this);
        this.socket.onclose = this.handleSocketClose.bind(this);
        
    }

    /**
     * Maintains WebSocket data request cycle
     * - Sends 'mqttlog' command when connection open
     * - Uses faster retry (150ms) when active
     * - Falls back to slower retry (1s) when closed
     */
    getChartDataPoint() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send('mqttlog');
            setTimeout(this.getChartDataPoint.bind(this), 150);
        } else {    
            setTimeout(this.getChartDataPoint.bind(this), 1000);    
        }   
    }

    /**
     * Refreshes sensor device list from API
     * - Fetches current devices every 5 seconds
     * - Updates sensor connection states
     * - Silently handles network errors
     */
    async refreshSensorDevices() {
        try {
            const response = await fetch('/api/sensor-devices');
            this.updateSensorStates(await response.json());
        } catch (error) {
            console.error('Sensor refresh failed:', error);
        }
    }

    /**
     * Updates sensor connection states from device list
     * - Matches devices to existing sensor cards
     * - Handles hostname-based sensor discovery
     * - Creates new cards for unrecognized sensors
     * - Updates connection status badges
     * @param {Object[]} devices - Current sensor devices from API
     */
    updateSensorStates(devices) {
        devices.forEach(device => {
            let sensor = null;

            if(device.name) {
                sensor = SensorConfigCard.registry.get(device.name);
            }

            if (device.hostname && device.hostname.indexOf('sensor') > -1) {
                let localName = device.hostname.replace('.local', '');
                if (SensorConfigCard.registry.get(localName)) {
                    sensor = SensorConfigCard.registry.get(localName);
                } else {
                    sensor = new SensorConfigCard({
                        name: localName,
                        effects: window.effects,
                        config: {}
                    });
                    sensor.render();
                }
            }                
            sensor?.updateConnectionStatus(device.connected);

        });

    }

    /**
     * Processes incoming WebSocket messages containing sensor data
     * - Batches messages by sensor name
     * - Updates relevant charts in single pass
     * - Handles message parsing errors
     * @param {MessageEvent} event - Raw WebSocket message event
     */
    handleSocketMessage(event) {
        try {
            const messages = JSON.parse(event.data);
            if (!Array.isArray(messages)) {
                throw new Error('Invalid message format - expected array');
            }
            
            const sensorData = new Map();  // Use Map for better key management
            
            // First process all messages
            messages.forEach(message => {
                const chartSensorName = `stairled-sensor-${message.sensor}`;
                const card = SensorConfigCard.registry.get(chartSensorName);
                
                if (card) {
                    if (!sensorData.has(chartSensorName)) {
                        sensorData.set(chartSensorName, []);
                    }
                    
                    sensorData.get(chartSensorName).push(message);
                }
            });

            // Then update all relevant cards
            sensorData.forEach((dataPoints, sensorName) => {
                const card = SensorConfigCard.registry.get(sensorName);
                if (card) {
                    card.updateChart(dataPoints);
                }
            });
            
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    }

    /**
     * Logs WebSocket errors to console
     * @param {Event} error - WebSocket error event
     */
    handleSocketError(error) {
        console.error('WebSocket error:', error);
    }

    /**
     * Handles WebSocket closure events
     * - Logs closure reason
     * - Triggers reconnection after 5s delay
     * @param {CloseEvent} event - WebSocket close event
     */
    handleSocketClose(event) {
        console.log(`WebSocket closed: ${event.reason}`);
        setTimeout(() => this.reconnectSocket(), 5000);
    }

    /**
     * Attempts WebSocket reconnection when closed
     * - Preserves original WebSocket URL
     * - Reuses existing event handlers
     * - Only acts when connection is fully closed
     */
    reconnectSocket() {
        if (this.socket.readyState === WebSocket.CLOSED) {
            this.socket = new WebSocket(this.socket.url);
            this.socket.onmessage = this.handleSocketMessage.bind(this);
            this.socket.onerror = this.handleSocketError.bind(this);
            this.socket.onclose = this.handleSocketClose.bind(this);
        }
    }
}