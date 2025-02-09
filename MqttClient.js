import mqtt from 'mqtt';
import EventEmitter from 'events';
import { eventBus, Events } from './services/EventBus.js';

/**
 * MqttClient class for handling MQTT connections and message processing.
 * @extends EventEmitter
 */
class MqttClient extends EventEmitter {
    /**
     * Creates an instance of MqttClient.
     * @param {Object} config - Configuration object containing MQTT settings.
     */
    constructor(config) {
        super();
        this.config = config;
        this.mqttHost = 'mqtt://' + this.config.get('mqtt:hostname');
        this.mqttChannel = this.config.get('mqtt:channel');
        this.client = null;
        this.sensorData = {};
        this.messageQueue = [];
        this.maxQueueSize = 100;

        // Emit sensor data updates periodically
        setInterval(() => {
            this.emit('update', this.sensorData);
        }, 100);
    }

    /**
     * Sets the maximum size of the message queue.
     * @param {number} size - The maximum number of messages to keep in the queue.
     * @returns {MqttClient} The current instance for method chaining.
     */
    setMaxQueueSize(size) {
        this.maxQueueSize = size;
        // Trim the queue if it's already larger than the new max size
        if (this.messageQueue.length > this.maxQueueSize) {
            this.messageQueue = this.messageQueue.slice(-this.maxQueueSize);
        }
        return this;
    }

    /**
     * Establishes a connection to the MQTT broker and sets up event listeners.
     * @returns {MqttClient} The current instance for method chaining.
     */
    connect() {
        console.log("MQTT Client: Connecting to : " + this.mqttHost);
        this.client = mqtt.connect(this.mqttHost);

        this.client.on('connect', () => {
            console.log('log', "MQTT Client connected!");
            const subscriptionTopic = `${this.mqttChannel}/#`;
            this.client.subscribe(subscriptionTopic, (err) => {
                if (!err) {
                    console.log('log', "MQTT Client subscribed to topic: " + subscriptionTopic);
                } else {
                    console.log('error', "Error subscribing to MQTT topic: " + err);
                }
            });
        });

        this.client.on('message', (topic, message) => {
            this.onMessage(topic, message);
        });

        return this;
    }

    /**
     * Processes incoming MQTT messages, updates the message queue and sensor data.
     * This method parses the message, adds it to a limited-size queue, and stores
     * sensor readings with timestamps.
     * @param {string} topic - The MQTT topic of the received message.
     * @param {Buffer} message - The message payload.
     */
    onMessage(topic, message) {
        const sensor = topic.split('/').pop();
        const value = parseFloat(message.toString()) || 0;
        // Emit generic sensor data event
        if(topic.split('/')[0] === 'sensors') {
            eventBus.emit(Events.SENSOR_DATA, sensor, value);
            eventBus.emit(`sensordata:${sensor}`, {timestamp: Date.now(), sensor: sensor, value: value});
        }

        // Update message queue
        this.messageQueue.push({
            timestamp: Date.now(),
            sensor: sensor,
            value: value
        });
        if (this.messageQueue.length > this.maxQueueSize) {
            this.messageQueue = this.messageQueue.slice(-this.maxQueueSize);
        }

        // Update sensor data
        if (!this.sensorData[sensor]) {
            this.sensorData[sensor] = [];
            this.emit(Events.SENSOR_DISCOVERED, sensor);
        }
        
        this.sensorData[sensor].push({
            timestamp: Date.now(),
            value: value
        });
        if (this.sensorData[sensor].length > 60) {
            this.sensorData[sensor].shift();
        }
    }

    /**
     * Retrieves the last N items from the message queue.
     * If N is not provided or is larger than the queue size, returns all items.
     * @param {number} [n] - The number of items to retrieve from the end of the queue.
     * @returns {Array} The last N items from the message queue.
     */
    getMessageQueue(n) {
        if (n === undefined || n >= this.messageQueue.length) {
            return this.messageQueue;
        }
        return this.messageQueue.slice(-n);
    }

    /**
     * Retrieves the latest messages from all sensors.
     * @returns {Array} An array of objects containing the latest sensor readings.
     */
    getLatestMessages() {
        return Object.entries(this.sensorData).flatMap(([sensor, data]) => 
            data.map(reading => ({ sensor, ...reading }))
        );
    }

    /**
     * Attaches an event listener to the MQTT client.
     * @param {string} event - The event to listen for.
     * @param {Function} callback - The callback function to execute when the event occurs.
     */
    on(event, callback) {
        if (this.client) {
            this.client.on(event, callback);
        } else {
            console.error('MQTT client not initialized');
        }
    }
}

export default MqttClient;
