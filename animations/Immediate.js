import TimelineAnimation from './TimelineAnimation.js';

/**
 * 'Immediate' Animation.
 * Sets led brightness to target brightness without fade
 */
class Immediate extends TimelineAnimation {

    
    /**
     * Defines validation rules for Immediate animation
     * @returns {Object} Validation configuration
     */
    static getValidationRules() {
        return {
            required: ['leds', 'brightness'],
            types: {
                leds: 'array',
                brightness: 'number'
            },
            ranges: {
                brightness: { min: 0, max: 4095 }
            }
        };
    }

    
    /**
     * @param {Object} options
     * @param {number} options.brightness - Target brightness [0-4095]
     * @param {number[]} options.leds - LED numbers to set
     * @param {number} [options.duration=50] - Animation duration in ms
     * @throws {Error} When required options are missing or invalid
     */
    constructor(options) {
        // Validation handled by parent class using our validation rules
        super({
            ...options,
            duration: 50 // Fixed duration for immediate effect
        });
        
        this.done = false;
    }


    /**
     * Renders the current animation frame
     * @returns {Object} LED states for this frame
     */
    render() {
        const output = {};
        for (const led of this.options.leds) {
            output[led] = this.options.brightness;
        }
        return output;
    }
}

export default Immediate;
