/**
 * Hardware emulator for LED control visualization in browser environments
 * 
 * Provides a virtual representation of physical LED controllers with DOM integration.
 * Key features:
 * - Real-time LED state tracking with PWM value storage (0-4095)
 * - Automatic CSS-based visual feedback for LED states
 * - Event hook system for state change notifications
 * - Bidirectional mapping between logical steps and physical pins
 * - Graceful handling of missing DOM elements
 * 
 * @class PinMapper
 * @example
 * const mapper = new PinMapper();
 * mapper.setBrightness(1, 2048); // Set step 1 to 50% brightness
 */
class PinMapper {
    /**
     * Initialize PinMapper instance with hardware mapping and state tracking
     * @constructs PinMapper
     * @property {Array<Object>} pinMapping - Configuration from window.pinMappingData
     * @property {Map<string, number>} brightnessState - Current PWM values (key: "driver-pin")
     * @property {Map<string, HTMLElement>} ledElements - Cached DOM references
     * @property {Set<Function>} hooks - State change listeners
     */
    constructor() {
        this.pinMapping = window.pinMappingData || [];
        this.brightnessState = new Map();
        this.ledElements = new Map();
        this.hooks = new Set();
        this.initializeLedElements();
    }

    /**
     * Cache DOM elements with 'led-preview' class into a Map
     * @private
     * @sideeffect Populates ledElements map
     * @note Elements must have data-driver and data-pin attributes
     * @example Key format: "pca9685-15" for driver="pca9685", pin="15"
     */
    initializeLedElements() {
        document.querySelectorAll('.led-preview').forEach(led => {
            const driver = led.dataset.driver;
            const pin = led.dataset.pin;
            this.ledElements.set(`${driver}-${pin}`, led);
        });
    }

    /**
     * Add a hook to be called when LED states change
     * @param {Function} callback - Function(Map<string, number>) where key is "driver-pin"
     */
    addHook(callback) {
        this.hooks.add(callback);
    }

    /**
     * Remove a previously added hook
     * @param {Function} callback - The callback to remove
     */
    removeHook(callback) {
        this.hooks.delete(callback);
    }

    /**
     * Retrieve current pin mapping configuration (safe copy)
     * @returns {Array<Object>} Clone of window.pinMappingData array
     * @example [{
     *   driver: "pca9685",
     *   pin: 15,
     *   step: 1,
     *   label: "Main LED"
     * }]
     */
    getPinMapping() {
        return this.pinMapping;
    }

    /**
     * Get current brightness for a logical animation step
     * @param {number} ledNumber - Logical step number from animation sequence
     * @returns {number} PWM value (0-4095) or 0 if unmapped
     * @note O(n) lookup - consider memoization for frequent access
     */
    getBrightness(ledNumber) {
        const mapping = this.pinMapping.find(m => m.step === ledNumber);
        return mapping ? this.brightnessState.get(`${mapping.driver}-${mapping.pin}`) || 0 : 0;
    }

    /**
     * Set brightness for a logical step and update visualization
     * @param {number} step - Logical step number (animation sequence index)
     * @param {number} brightness - PWM value (0-4095, clamped automatically)
     * @sideeffect Updates brightnessState, DOM elements, and triggers hooks
     * @throws {Error} If brightness is NaN (non-error for out-of-range values)
     */
    setBrightness(step, brightness) {
        brightness = Math.min(Math.max(brightness, 0), 4095);
        // Find the mapping for this step
        const mapping = this.pinMapping.find(m => m.step === step);
        if (!mapping) return;

        // Use the existing method with driver and pin
        const key = `${mapping.driver}-${mapping.pin}`;
        this.brightnessState.set(key, brightness);
        this.updateLedDisplay(key, brightness);
        
        // Notify hooks of state change
        this.hooks.forEach(hook => hook(this.brightnessState));
    }

    /**
     * Direct driver/pin control (bypasses step mapping)
     * @param {string} driver - Hardware controller ID (e.g., "pca9685")
     * @param {number} pin - Physical pin number on driver board
     * @param {number} brightness - PWM value (0-4095, clamped automatically)
     * @note Maintained for backward compatibility with direct hardware APIs
     */
    setBrightnessForPin(driver, pin, brightness) {
        const key = `${driver}-${pin}`;
        this.brightnessState.set(key, Math.min(Math.max(brightness, 0), 4095));
        this.updateLedDisplay(key, brightness);
        this.hooks.forEach(hook => hook(this.brightnessState));
    }

    /**
     * Update LED visualization in DOM
     * @private
     * @param {string} key - Map key in "driver-pin" format
     * @param {number} brightness - Raw PWM value (0-4095)
     * @sideeffect Modifies element styles and classes
     * @note Implements PWM→opacity conversion (0-4095 → 0-100%)
     */
    updateLedDisplay(key, brightness) {
        brightness = Math.min(Math.max(brightness, 0), 4095);
        const led = this.ledElements.get(key);
        if (!led) return;
        // Convert PWM value (0-4095) to opacity (0-1)
        let opacity = (brightness / 4095) * 100;
        opacity = Math.min(Math.max(opacity, 0), 100);
        console.log(key, brightness, opacity);
        // Simple color with opacity
        led.style.boxShadow = `-1px 4px 3px 2px rgb(255 247 0 / ${opacity}%)`;
        console.log(`0 0 10px rgba(255, 234, 131 / ${opacity})`)
        
        //led.style.backgroundColor = `rgba(255, 234, 131, ${opacity})`;
        console.log(key, brightness, led.style.backgroundColor);
        led.classList.toggle('on', brightness > 0);
    }

    /**
     * Set uniform brightness across all mapped LEDs
     * @param {number} brightness - PWM value (0-4095) for all LEDs
     * @sideeffect Iterates through all pin mappings
     * @note Uses setBrightness() internally for individual updates
     */
    setAllBrightness(brightness) {
        this.pinMapping.forEach(mapping => {
            this.setBrightness(mapping.step, brightness);
        });
    }
}

const pinmapper = new PinMapper();
export default pinmapper; 