class Dashboard {
    constructor() {
        this.sensors = new Set();
        this.maxLogLines = 1000;
        
        // Use process.stdout directly to avoid circular reference
        process.stdout.write('\x1Bc'); // Clear screen
        this._writeLog('Starting MQTT Sensor Dashboard\n');
        this._writeLog('='.repeat(80) + '\n');
    }

    /**
     * Write directly to stdout to avoid console.log circular reference
     * @private
     */
    _writeLog(message) {
        process.stdout.write(message);
    }

    /**
     * Format a log message with timestamp
     * @private
     */
    formatLog(message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${message}\n`;
    }

    /**
     * Log a message to stdout
     */
    log(message) {
        this._writeLog(this.formatLog(message));
    }

    /**
     * Update sensor status
     */
    updateSensor(sensorName, isPresent) {
        if (isPresent && !this.sensors.has(sensorName)) {
            this.sensors.add(sensorName);
            this.log(`Sensor connected: ${sensorName}`);
        } else if (!isPresent && this.sensors.has(sensorName)) {
            this.sensors.delete(sensorName);
            this.log(`Sensor disconnected: ${sensorName}`);
        }
    }

    /**
     * Handle various update types
     */
    update(type, id, value) {
        switch (type) {
            case 'sensor':
                if (typeof value === 'boolean') {
                    this.updateSensor(id, value);
                } else {
                    this.log(`Sensor ${id}: ${value}`);
                }
                break;
            case 'status':
                this.log(`Status update - ${id}: ${value}`);
                break;
            default:
                this.log(`Unknown update type: ${type}`);
        }
    }

    /**
     * Log initialization success
     */
    initSuccess(component) {
        this.log(`✓ Initialized ${component}`);
    }

    /**
     * Log initialization failure
     */
    initFail(component, error) {
        this.log(`✗ Failed to initialize ${component}: ${error.message}`);
    }
}

export default Dashboard;
