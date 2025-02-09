import TimeLine from '../animationengine/TimeLine.js';
import TimelineAnimation from './TimelineAnimation.js';
import FadeTo from './FadeTo.js';

/**
 * Shifting Animation.
 * Fades led numbers passed in `options.leds[]` from their current brightness to zero
 * and applies the current brightness to the next item over. Can shift up or down and
 * optionally bounce between directions.
 */
class Shifting extends TimelineAnimation { 
    
     /**
     * Defines validation rules for Shifting animation
     * @returns {Object} Validation configuration object containing required fields, types, and ranges
     */
    static getValidationRules() {
        return {
            required: ['duration', 'leds', 'shifts'],
            types: {
                duration: 'number',
                leds: 'array',
                shifts: 'number',
                direction: 'string',
                bouncing: 'boolean',
                bounceAfter: 'number'
            },
            ranges: {
                duration: { min: 0 },
                shifts: { min: 1 },
                bounceAfter: { min: 0 },
                leds: { minLength: 2 }
            },
            enums: {
                direction: ['up', 'down']
            }
        };
    }

    /**
     * Creates a new Shifting animation
     * @param {Object} options
     * @param {number} options.shifts - Number of shifts to perform (min: 1)
     * @param {number} options.duration - Total animation duration in ms
     * @param {Object} options.mapper - LED mapper instance to find current pin brightnesses
     * @param {number[]} options.leds - LED numbers to shift (minimum 2 LEDs required)
     * @param {string} [options.direction='up'] - Shift direction ('up' or 'down')
     * @param {boolean} [options.bouncing=false] - Whether to bounce direction
     * @param {number} [options.bounceAfter] - Number of shifts before bouncing (min: 1)
     * @throws {Error} When required options are missing or invalid
     */
    constructor(options) {
        if (!options.shifts || typeof options.shifts !== 'number') {
            throw new Error(`Shifting requires 'shifts' number, got: ${options.shifts}`);
        }
        if (!options.mapper) {
            throw new Error("Shifting requires 'mapper' instance");
        }
        if (!Array.isArray(options.leds) || options.leds.length < 2) {
            throw new Error("Shifting requires 'leds' array with at least 2 LEDs");
        }
        if (options.direction && !['up', 'down'].includes(options.direction)) {
            throw new Error(`Invalid direction '${options.direction}', must be 'up' or 'down'`);
        }

        super(options);
        this.brightnesses = [];
        this.options.direction = this.options.direction || 'up';
        this.options.bouncing = this.options.bouncing || false;
        this.options.bounceAfter = this.options.bounceAfter || this.options.leds.length;
        this.timeline = null;
    }

    

    /**
     * Called when the animation starts. Sets up the timeline and initializes
     * the shifting sequence.
     */
    onStart() {
        this.timeline = new TimeLine();
        for (var i = 0; i < this.options.leds.length; i++) {
            this.brightnesses.push({ 
                led: this.options.leds[i], 
                brightness: this.options.mapper.getBrightness(this.options.leds[i])
            });
        }
        // Create a copy of the start state LEDs and prepare to shift brightnesses
        // Loop through the number of shifts specified in options
        // For each LED, add a FadeTo animation to the timeline
        // Shift the LED states for the next iteration
        // If bouncing is enabled, toggle the direction after a specified number of shifts
        var originalStates = this.brightnesses;
        
        for (i = 0; i < this.options.shifts; i++) {
            var shiftedStates = this.shift(originalStates, this.options.direction);
            for (var j = 0; j < this.options.leds.length; j++) {
                this.timeline.add(Math.round(i * (this.options.duration / this.options.shifts)), new FadeTo({
                    brightness: shiftedStates[j].brightness,
                    duration: this.options.duration / this.options.shifts,
                    mapper: this.options.mapper,
                    leds: [this.options.leds[j]]
                }));
            }
            originalStates = this.shift(originalStates, this.options.direction);
            if (this.options.bouncing && i % this.options.bounceAfter == 0) {
                this.options.direction = this.options.direction == 'up' ? 'down' : 'up';
            } 
        }
        this.timeline.setStartTime(this.absoluteStart);
    }

    /**
     * Shifts the LED states in the specified direction
     * @param {Array<{led: number, brightness: number}>} input - Array of LED states to shift
     * @param {string} direction - Direction to shift ('up' or 'down')
     * @returns {Array<{led: number, brightness: number}>} Shifted LED states
     * @throws {Error} When input array has less than 2 LEDs
     */
    shift(input, direction) {
        var output = [], i = 0;
        if (input.length < 2) {
            throw new Error("Need at least 2 leds to be able to shift!");
        }
        switch (direction) {
            case 'up':
                for (i = 1; i < input.length; i++) {
                    output.push(input[i]);
                }
                output.push(input[0]);           
                break;
            case 'down':
                output.push(input[input.length - 1]);
                for (i = 0; i < input.length - 1; i++) {
                    output.push(input[i]);
                }
                break;
        }
        return output;
    }

    /**
     * Resets the animation timeline
     */
    reset() {
        this.timeline.reset();
        super.reset();
    }

    /**
     * Renders the current animation frame
     * @returns {Object.<string, number>} LED states for this frame, where key is LED number and value is brightness
     */
    render() {
        var output = {};
        this.timeline.setCurrentPosition(this.absoluteCurrent);
        var items = this.timeline.getActiveItems();
        for (var item of items) {
            var pins = item.render();
            for (var pin in pins) {
                output[pin] = parseInt(pins[pin]);
            }
        }
        return output;
    } 

   
}

export default Shifting;
