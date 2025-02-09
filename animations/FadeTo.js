import TimelineAnimation from './TimelineAnimation.js';

/**
 * A Fade To Animation.
 * Fades all LEDs to target brightness
 */
class FadeTo extends TimelineAnimation {

    /**
     * Defines validation rules for FadeTo animation
     * @returns {Object} Validation configuration
     */
    static getValidationRules() {
        return {
            required: ['duration', 'leds', 'brightness'],
            types: {
                duration: 'number',
                leds: 'array',
                brightness: 'number'
            },
            ranges: {
                duration: { min: 0 },
                brightness: { min: 0, max: 4095 }
            }
        };
    }

    /**
     * @param {Object} options
     * @param {number} options.brightness - Target brightness [0-4095]
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
            if (this.startBrightness[led] === undefined) {
                this.startBrightness[led] = this.options.mapper.getBrightness(led) || 0;
            }

            const range = this.options.brightness - this.startBrightness[led];
            const current = this.startBrightness[led] + ((range / 100) * this.progress);
            output[led] = current;
        }

        return output;
    }
}

export default FadeTo;
