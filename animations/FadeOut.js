import TimelineAnimation from './TimelineAnimation.js';

/**
 * A Fade Out Animation.
 * Fades all LEDs from their current brightness to target brightness
 */
class FadeOut extends TimelineAnimation {
    
    /**
     * Defines validation rules for FadeOut animation
     * @returns {Object} Validation configuration
     */
    static getValidationRules() {
        return {
            required: ['duration', 'leds', 'start', 'end'],
            types: {
                duration: 'number',
                leds: 'array',
                start: 'number',
                end: 'number'
            },
            ranges: {
                duration: { min: 0 },
                start: { min: 0, max: 4095 },
                end: { min: 0, max: 4095 }
            }
        };
    }
    
    /**
     * @param {Object} options
     * @param {number} options.start - Starting brightness [0-4095]
     * @param {number} options.end - Target brightness [0-4095]
     * @param {number} options.duration - Animation duration in ms
     * @param {number[]} options.leds - LED numbers to fade
     * @throws {Error} When required options are missing or invalid
     */
    constructor(options) {
        super(options);
        this.startBrightness = {};
    }


    /**
     * Renders the current animation frame
     * @returns {Object} LED states for this frame
     */
    render() {
        const output = {};
        
        for (const led of this.options.leds) {
            // Track start brightness per LED
            if (this.startBrightness[led] === undefined) {
                this.startBrightness[led] = this.options.mapper.getBrightness(led) || this.options.start;
            }

            const range = this.startBrightness[led] - this.options.end;
            const current = this.startBrightness[led] - ((range / 100) * this.progress);
            output[led] = current;
        }

        return output;
    }
}

export default FadeOut;
