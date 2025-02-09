import { FadeIn, FadeOut, FadeTo, Immediate, Shifting, Sequence } from './index.js';
import LedstripAnimation from '../animationengine/LedstripAnimation.js';
import AnimationConfigValidator from './interfaces/AnimationConfig.js';
import pinMapper from '../PinMapper.js';

/**
 * Manages configurable stair lighting animations including:
 * - Timeline-based animation sequences
 * - Multiple animation type support (Fade, Sequence, Immediate, etc.)
 * - Custom step configurations
 * - Dynamic LED mapping
 * - Easing function customization
 */
class StairAnimation {
    /**
     * Creates new stair animation instance
     * Validates and initializes animation configuration
     * Sets up timeline and LED mappings
     * Throws error if configuration is invalid
     * 
     * @param {Object} config Animation configuration object
     * @param {string} config.name Animation name identifier
     * @param {string} config.description Human-readable animation description
     * @param {Array<TimelineStep>} config.timeline Ordered animation steps with timing
     * @param {StepConfig} [config.stepConfig] Optional custom step mapping configuration
     * @param {Array<number>} [config.leds] Optional specific LEDs to animate
     * @throws {Error} If configuration validation fails
     */
    constructor(config) {
        try {
            // Validate configuration before initializing
            AnimationConfigValidator.validateConfig(config);
            
            this.name = config.name;
            this.description = config.description;
            this.timeline = Array.isArray(config.timeline) ? config.timeline : [];
            this.leds = config.leds || [];
            this.stepConfig = config.stepConfig;
            this.animation = null;
            this.initialize();
        } catch (error) {
            console.error('Invalid animation configuration:', error);
            throw error;
        }
    }

    /**
     * Sets up animation timeline and LED mappings
     * Maps timeline steps to animation types
     * Configures LED selections for each step
     * Uses all available steps if none specified
     * Creates animation instances with proper timing
     * @private
     */
    initialize() {
        this.animation = new LedstripAnimation(pinMapper);
        
        // Get all available steps from pin mapping
        const allSteps = pinMapper.pinMapping
            .map(mapping => mapping.step)
            .filter(step => step !== undefined);
        
        // Add each timeline step with its specific animation type
        this.timeline.forEach(step => {
            const AnimationType = {
                'Sequence': Sequence,
                'FadeTo': FadeTo,
                'FadeOut': FadeOut,
                'FadeIn': FadeIn,
                'Immediate': Immediate,
                'Shifting': Shifting
            }[step.type];

            if (AnimationType) {
                // If no leds specified in options, use all available steps
                const leds = step.options?.leds?.length > 0 ? step.options.leds : allSteps;
                
                const animation = new AnimationType({
                    ...step.options,
                    leds: leds,
                    mapper: pinMapper
                });
                
                this.animation.add(parseInt(step.at), animation);
            }
        });
    }

    /**
     * Updates animation easing function
     * Applies to all subsequent animations
     * Controls acceleration/deceleration of effects
     * 
     * @param {Function} easingFunction Mathematical function for animation timing
     */
    setEasingFunction(easingFunction) {
        this.animation.setEasingFunction(easingFunction);
    }

    /**
     * Begins animation playback
     * Executes timeline steps in sequence
     * Applies configured animations to mapped LEDs
     * No effect if animation is not initialized
     */
    start() {
        if (this.animation) {
            this.animation.start();
        }
    }

    /**
     * Halts animation playback
     * Stops all active animations immediately
     * Maintains current LED states
     * No effect if animation is not running
     */
    stop() {
        if (this.animation) {
            this.animation.stop();
        }
    }

    /**
     * Updates animation configuration
     * Allows dynamic LED selection changes
     * Reinitializes animation timeline
     * Preserves other existing settings
     * 
     * @param {Object} config Updated configuration object
     * @param {Array<number>} [config.leds] New LED selection to animate
     */
    updateConfig(config) {
        this.leds = config.leds || this.leds;
        this.initialize();
    }
}

export default StairAnimation;