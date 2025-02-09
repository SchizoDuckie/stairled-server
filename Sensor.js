import Stairlog from "./db/entities/Stairlog.js";
import { eventBus, Events } from './services/EventBus.js';
import { animationService } from './services/AnimationService.js';

/**
 * Manages individual sensor functionality including:
 * - Sensor state and configuration management
 * - Event-based trigger processing
 * - Animation triggering and coordination
 * - Sensor activity logging
 * - Real-time threshold monitoring
 * - Event bus integration
 */
class Sensor {
    /**
     * Creates a new sensor instance
     * @param {object} config - Sensor configuration
     */
    constructor(config) {
        this.enabled = config.enabled;
        this.name = config.name;
        this.type = config.type;
        this.channel = config.channel;
        this.triggerThreshold = config.triggerThreshold;
        this.triggerType = config.triggerType;
        this.triggerEffect = config.triggerEffect;
        this.active = false;
        this.lastTriggered = null;
        this.lastLogTime = 0;
        

        // Get animation from centralized service
        this.anim = animationService.animations.get(this.triggerEffect);
        
        if (!this.anim) {
            eventBus.emit(Events.SYSTEM_ERROR, 
                `Animation '${this.triggerEffect}' not found for sensor ${this.name}`);
        }
        
        // Add instance tracking
        this._instanceId = Symbol(config.name);
        
        this.initEventListeners();
    }

    /**
     * Extracts normalized sensor name by removing 'stairled-sensor-' prefix
     * Used for consistent event handling and logging
     * 
     * @returns {string} Normalized sensor name without prefix
     */
    getNormalizedName()
    {
        return this.name.split('stairled-sensor-')[1] || this.name;
    }

    /**
     * Sets up event bus listeners for sensor data
     * Filters events to only process matching sensor data
     * Triggers value processing when matching events received
     */
    initEventListeners() {
        eventBus.on(`sensordata:${this.getNormalizedName()}`, (event) => {
            if (event.sensor !== this.getNormalizedName()) return;
            this.processTrigger(event.value);
        });
    }

    /**
     * Evaluates sensor values against configured threshold
     * Processes trigger conditions based on comparison operator
     * Supports <=, >=, and == comparisons
     * 
     * @param {number} value - The sensor reading to evaluate
     */
    processTrigger(value) {
        switch (this.triggerType) {
            case "<=":
                if (value <= this.triggerThreshold) {
                    this.trigger(value);
                }
                break;
            case ">=":
                if (value >= this.triggerThreshold) {
                    this.trigger(value);
                }
                break;
            case "==":
                if (value === this.triggerThreshold) {
                    this.trigger(value);
                }
                break;
        }
    }

    /**
     * Handles sensor activation and animation triggering
     * Prevents multiple triggers within 2 second window
     * Logs trigger events to database
     * Checks for existing running animations before starting new ones
     * Emits system events for logging and debugging
     * 
     * @param {number} value - The triggering sensor value
     * @returns {Promise<void>}
     */
    async trigger(value) {
        if(!this.active) {
            this.active = true;
            this.lastTriggered = new Date();
            
            eventBus.emit(Events.SYSTEM_INFO, 
                `Sensor '${this.name}' triggered! Measured ${value} ${this.triggerType} configured treshold ${this.triggerThreshold}. Starting LedstripAnimation '${this.triggerEffect}'`);
            
            setTimeout(() => { this.active=false }, 2000);
            
            if(this.anim) {
                let skip = false;
                // Check all animations through the service
                animationService.animations.forEach(anim => {
                    if(anim.started) {
                        eventBus.emit(Events.SYSTEM_DEBUG, 
                            `Animation ${anim.name} is still active, not starting a new one`);
                        skip = true;
                    }
                });
                
                if(!skip) {
                    this.anim.start();
                }
            } else {
                eventBus.emit(Events.SYSTEM_ERROR, 
                    `Not starting anim ${this.triggerEffect} because it wasn't found.`);
            }

            try {
                let logRecord = new Stairlog();
                logRecord.sensorname = this.name;
                logRecord.sensorvalue = value;
                logRecord.effect = this.triggerEffect;
                await logRecord.Save();
            } catch (error) {
                eventBus.emit(Events.SYSTEM_ERROR, 
                    `Error during log insert into sqlite3: ${error.message}`);
            }
        }
    }

    /**
     * Updates sensor configuration without instance recreation
     * Revalidates animation availability after config change
     * Emits error if new animation not found
     * 
     * @param {object} newConfig - Updated sensor configuration
     */
    updateConfig(newConfig) {
        Object.assign(this, newConfig);
        this.anim = animationService.animations.get(this.triggerEffect);
        
        if (!this.anim) {
            eventBus.emit(Events.SYSTEM_ERROR, 
                `Animation '${this.triggerEffect}' not found for sensor ${this.name}`);
        }
    }
}

export default Sensor;
