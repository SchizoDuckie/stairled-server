import EventEmitter from 'events';

/**
 * Central event bus for application-wide events
 */
class EventBus extends EventEmitter {
    // Event name constants
    static Events = {
        // Sensor events
        SENSOR_DISCOVERED: 'sensor:discovered',
        SENSOR_UPDATED: 'sensor:updated',
        SENSOR_REMOVED: 'sensor:removed',
        SENSOR_STATUS: 'sensor:status',
        SENSOR_DATA: 'sensor:data',
        SENSOR_CONFIG: 'sensor:config',

        // System events
        SYSTEM_ERROR: 'system:error',
        SYSTEM_INFO: 'system:info',
        SYSTEM_DEBUG: 'system:debug',

        // Service events
        SERVICE_STATUS: 'service:status',
        MQTT_MESSAGE: 'mqtt:message',
        MDNS_STATUS: 'mdns:status'
    };

    constructor() {
        super();
        // Set higher limit for event listeners
        this.setMaxListeners(50);
    }


    /**
     * Emit an event with a data object
     * @param {string} event - Event name from Events enum
     * @param {Object} data - Data object to pass with the event
     */
    emitData(event, data) {
        this.emit(event, data);
    }

    /**
     * Emit a system event with a message
     * @param {string} level - 'error', 'info', or 'debug'
     * @param {string} message - Message to log
     * @param {Object} [data] - Optional additional data
     */
    system(level, message, data = null) {
        const event = `system:${level}`;
        this.emit(event, { message, data });
    }
}

// Create singleton instance
export const eventBus = new EventBus();
export const Events = EventBus.Events; 