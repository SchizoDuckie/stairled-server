import TimeLine from '../animationengine/TimeLine.js';
import TimelineAnimation from './TimelineAnimation.js';
import FadeTo from './FadeTo.js';

/**
 * Sequence Animation.
 * Fades led numbers passed in `options.leds[]` from their current brightness to `options.brightness` one by one
 */
class Sequence extends TimelineAnimation { 

    /**
     * Defines validation rules for Sequence animation
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
     * Creates a new Sequence animation
     * @param {Object} options
     * @param {number} options.brightness - Target brightness [0-4095]
     * @param {number} options.duration - Animation duration in ms
     * @param {Object} options.mapper - LedMapper instance to find current pin brightnesses
     * @param {number[]} options.leds - LED numbers to fade in sequence
     * @throws {Error} When required options are missing or invalid
     */
    constructor(options) {
        super(options);

        this.timeline = new TimeLine();
        /**
         * How long each step of the timeline should last based on the amount of leds passed
         * @type {number}
         */
        let stepDuration = Math.floor(this.options.duration / this.options.leds.length);

        /**
         * Create a clone of the fade for every led in the passed options and add that to the timeline after
         * the previous one.
         */
        for(var index=0; index< this.options.leds.length; index++) {
            let clonedFade = new FadeTo({
                brightness: this.options.brightness,
                duration: stepDuration,
                mapper: this.options.mapper,
                leds: [this.options.leds[index]]
            });
            this.timeline.add(index * stepDuration, clonedFade);
        }
    }

    /**
     * Called when the animation starts
     */
    onStart() {
        this.timeline.setStartTime(this.absoluteStart);
    }

    /**
     * Renders the current animation frame
     * @returns {Object.<string, number>} LED states for this frame, where key is LED number and value is brightness
     */
    render() {
        let output = {};
        this.timeline.setCurrentPosition(this.absoluteCurrent);
        let items = this.timeline.getActiveItems();
        for(let item of items) {
            let pins = item.render();
            for(let pin in pins) {
                output[pin] = parseInt(pins[pin]);
            }
        }

        return output;
    }

    /**
     * Converts the animation to a string representation for debugging
     */
    toString() {
        console.log(this.constructor.name, this.options, this.timeline);
    }

   
}

export default Sequence;
