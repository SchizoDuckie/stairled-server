import TimelineAnimation from './TimelineAnimation.js';

/**
 * A Fade In Animation.
 * Fades all LEDs from `options.start` to `options.end`
 */
class FadeIn extends TimelineAnimation {

    /**
     * Defines validation rules for FadeIn animation
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
    }

    
    /**
     * Renders the current animation frame
     * @returns {Object} LED states for this frame
     */
    render() {
        const output = {};
        const range = this.options.end - this.options.start;
        const current = this.options.start + ((range / 100) * this.progress);

        for (const led of this.options.leds) {
            output[led] = current;
        }

        return output;
    }
}

export default FadeIn;
