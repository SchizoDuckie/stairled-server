import { FadeIn, FadeOut, FadeTo, Immediate, Sequence, Shifting } from '../index.js';

/**
 * Animation configuration validator and type checker
 */
class AnimationConfigValidator {
    // Map of animation classes to use their validation rules
    static animationClasses = {
        FadeIn,
        FadeOut,
        FadeTo,
        Immediate,
        Sequence,
        Shifting
    };

    static validators = {
        FadeIn: (options) => this.validateWithRules(options, FadeIn.getValidationRules()),
        FadeOut: (options) => this.validateWithRules(options, FadeOut.getValidationRules()),
        FadeTo: (options) => this.validateWithRules(options, FadeTo.getValidationRules()),
        Immediate: (options) => this.validateWithRules(options, Immediate.getValidationRules()),
        Sequence: (options) => this.validateWithRules(options, Sequence.getValidationRules()),
        Shifting: (options) => this.validateWithRules(options, Shifting.getValidationRules())
    };

    /**
     * Validates options against provided validation rules
     * @private
     * @param {Object} options - Options to validate
     * @param {Object} rules - Validation rules from animation class
     * @throws {Error} When validation fails
     */
    static validateWithRules(options, rules) {
        if (!options) {
            throw new Error("Options object is required");
        }

        // Check required fields
        for (const field of rules.required || []) {
            if (options[field] === undefined) {
                throw new Error(`'${field}' is required`);
            }
        }

        // Check types
        for (const [field, type] of Object.entries(rules.types || {})) {
            if (options[field] !== undefined) {
                const actualType = Array.isArray(options[field]) ? 'array' : typeof options[field];
                if (actualType !== type) {
                    throw new Error(`'${field}' must be of type ${type}, got ${actualType}`);
                }
            }
        }

        // Check ranges
        for (const [field, range] of Object.entries(rules.ranges || {})) {
            if (options[field] !== undefined) {
                if (range.min !== undefined && options[field] < range.min) {
                    throw new Error(`'${field}' must be >= ${range.min}`);
                }
                if (range.max !== undefined && options[field] > range.max) {
                    throw new Error(`'${field}' must be <= ${range.max}`);
                }
                if (range.minLength !== undefined && Array.isArray(options[field]) && options[field].length < range.minLength) {
                    throw new Error(`'${field}' must have at least ${range.minLength} elements`);
                }
            }
        }

        // Check enums if defined
        for (const [field, validValues] of Object.entries(rules.enums || {})) {
            if (options[field] !== undefined && !validValues.includes(options[field])) {
                throw new Error(`'${field}' must be one of: ${validValues.join(', ')}`);
            }
        }

        return true;
    }

    /**
     * Validates a timeline step configuration
     * @param {Object} step - Timeline step configuration
     * @throws {Error} When validation fails
     */
    static validateTimelineStep(step) {
        if (!step.type || !this.validators[step.type]) {
            throw new Error(`Invalid animation type: ${step.type}`);
        }
        if (typeof step.at !== 'number') {
            throw new Error("Timeline step requires 'at' timestamp");
        }
        if (!step.options) {
            throw new Error("Timeline step requires 'options' object");
        }

        return this.validators[step.type](step.options);
    }

    /**
     * Validates a complete animation configuration
     * @param {Object} config - Complete animation configuration
     * @throws {Error} When validation fails
     */
    static validateConfig(config) {
        if (!config.timeline || !Array.isArray(config.timeline)) {
            throw new Error("Animation requires 'timeline' array");
        }

        config.timeline.forEach((step, index) => {
            try {
                this.validateTimelineStep(step);
            } catch (error) {
                throw new Error(`Timeline step ${index}: ${error.message}`);
            }
        });

        return true;
    }
}

export default AnimationConfigValidator; 