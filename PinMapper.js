import Wire from 'i2c';
import sleeper from "sleep";

// Constants
const OSCILLATOR_FREQ = 27000000;
const PWM_FREQUENCY = 52000;
const PCA9685_BASE_ADDRESS = 0x40;
const PCA9685_MAX_ADDRESS = 0x7F;
const MODE1_REGISTER = 0x00;

// Set much higher limit for event listeners since i2c lib adds them per instance
process.setMaxListeners(100);


/**
 * PCA9685 LED controller manager providing:
 * - Auto-discovery of multiple PCA9685 devices on I2C bus
 * - Dynamic pin mapping and remapping capabilities
 * - Brightness control for individual and grouped LEDs
 * - Robust cleanup and resource management
 * - Pin testing and validation
 * - Configuration persistence
 * - Real-time pin state monitoring
 * - Driver address normalization and validation
 * - Automatic error recovery and retry logic
 */
class PinMapper {
    /**
     * Creates PinMapper instance and initializes core components
     * Sets up cleanup handlers for graceful shutdown
     * Configures event listeners for process termination
     * Initializes pin mapping and brightness tracking
     * Prepares I2C communication infrastructure
     */
    constructor(pinmapping = {}) {
        console.log('Initializing PinMapper instance');
        this.drivers = {};
        this.pinMapping = pinmapping;
        this.brightnesses = {};
        this.wire = null;
        
        // Properly bind exit handler
        this.exitHandler = this.exitHandler.bind(this);
        
        // Store initial listener count
        this.initialExitListeners = process.listeners('exit').length;
        
        // Stronger cleanup registration
        this.registeredCleanup = false;
        this.registerCleanupHandlers();
    }

    /**
     * Unified exit handler with proper cleanup sequence
     * Prevents multiple cleanup calls
     * Ensures graceful shutdown of resources
     */
    exitHandler() {
        if (!this.cleanupCompleted) {
            this.cleanup();
        }
    }

    /**
     * Registers cleanup handlers with process events
     * Handles SIGINT and SIGTERM signals
     * Manages uncaught exceptions
     * Prevents duplicate registrations
     * @private
     */
    registerCleanupHandlers() {
        if (this.registeredCleanup) return;
        
        // Handle normal exits
        process.on('exit', this.exitHandler);
        
        // Handle signals
        process.on('SIGINT', this.exitHandler);
        process.on('SIGTERM', this.exitHandler);
        
        // Handle uncaught exceptions as last resort
        process.on('uncaughtException', this.exitHandler);
        
        this.registeredCleanup = true;
    }

    /**
     * Performs complete resource cleanup
     * Closes I2C connections with retry logic
     * Removes process event listeners
     * Prevents multiple cleanup attempts
     * Logs cleanup progress and errors
     * @private
     */
    cleanup() {
        console.log('Cleaning up PinMapper resources...');
        try {
            // Prevent double cleanup
            if (this.cleanupCompleted) return;
            this.cleanupCompleted = true;
            
            // Existing cleanup logic
            if (this.wire) {
                console.log('Closing I2C bus...');
                this.wire.closeSync();
            }
            
            // Driver cleanup with retries
            Object.values(this.drivers).forEach(driver => {
                console.log(`Closing driver at ${driver.address}...`);
                try {
                    if (driver && typeof driver.close === 'function') {
                        // Add retry logic for driver close
                        const maxAttempts = 3;
                        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                            try {
                                driver.close();
                                break;
                            } catch (err) {
                                if (attempt === maxAttempts) throw err;
                                console.log(`Retrying driver close (attempt ${attempt})...`);
                                sleep.msleep(100);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Driver close error:', err);
                }
            });
            
            // Keep existing listener cleanup but add logging
            const currentListeners = process.listeners('exit');
            console.log(`Current exit listeners: ${currentListeners.length}`);
            
        } catch (err) {
            console.error('Error during cleanup:', err);
        } finally {
            // Ensure we always remove our listeners
            process.removeListener('exit', this.exitHandler);
            process.removeListener('SIGINT', this.exitHandler);
            process.removeListener('SIGTERM', this.exitHandler);
            process.removeListener('uncaughtException', this.exitHandler);
        }
    }

    /**
     * Scans I2C bus for valid PCA9685 devices
     * Validates device responses through MODE1 register
     * Filters out known false positives
     * Handles connection errors gracefully
     * Cleans up resources after scan
     * 
     * @param {number} busNumber - I2C bus to scan (defaults to 1)
     * @returns {Promise<string[]>} Array of discovered device addresses in hex
     */
    async discoverDevices(busNumber = 1) {
        console.log(`Attempting to discover devices on i2c bus ${busNumber}`);
        const discoveredAddresses = [];
        const initialExitListeners = process.listeners('exit').length;

        try {
            for (let addr = PCA9685_BASE_ADDRESS; addr <= PCA9685_MAX_ADDRESS; addr++) {
                // Skip the known false positive at 0x70
                if (addr === 0x70) continue;
                
                let wire = null;
                try {
                    wire = new Wire(addr, {device: `/dev/i2c-${busNumber}`});
                    
                    // Read MODE1 register and validate its value
                    const result = await new Promise((resolve, reject) => {
                        wire.readBytes(MODE1_REGISTER, 1, (err, buffer) => {
                            if (err) {
                                resolve(null);
                                return;
                            }
                            resolve(buffer);
                        });
                    });

                    if (result) {
                        const mode1Value = result[0];
                        // Validate MODE1 register - typical values should be 0x00, 0x11, or similar
                        // Ignore clearly invalid values that might come from non-PCA9685 devices
                        if (mode1Value <= 0x7F) {  // Valid MODE1 values are 7-bit
                            const hexAddr = `0x${addr.toString(16)}`;
                            discoveredAddresses.push(hexAddr);
                            console.log(`✓ Found PCA9685 at address ${hexAddr}, MODE1 register: 0x${mode1Value.toString(16)}`);
                        } else {
                            console.warn(`⚠️ Device at 0x${addr.toString(16)} responded but may not be PCA9685 (MODE1: 0x${mode1Value.toString(16)})`);
                        }
                    }
                } catch (err) {
                    continue;
                } finally {
                    if (wire) {
                        try {
                            wire.closeSync();
                            const currentListeners = process.listeners('exit');
                            if (currentListeners.length > initialExitListeners) {
                                currentListeners.slice(initialExitListeners).forEach(listener => {
                                    process.removeListener('exit', listener);
                                });
                            }
                        } catch (closeErr) {
                            // Ignore close errors
                        }
                    }
                }
            }

            // Additional validation step
            if (discoveredAddresses.length === 0) {
                console.warn('No PCA9685 devices found during scan');
            } else {
                console.log(`Device discovery completed. Found ${discoveredAddresses.length} devices:`, discoveredAddresses);

            }
            
            return discoveredAddresses;

        } catch (err) {
            console.error('Critical error during device discovery:', err);
            return [];
        }
    }

    /**
     * Sets up discovered PCA9685 devices with drivers
     * Auto-generates default pin mapping if none exists
     * Validates device initialization
     * Handles initialization failures gracefully
     * 
     * @param {PCA9685Constructor} PCA9685Class - PCA9685 driver constructor
     * @returns {Promise<PinMapper>} Self reference for chaining
     */
    async initializeDiscoveredDevices(PCA9685Class, storedMapping = {}) {
        console.log('Starting device initialization...');
        try {
            const addresses = await this.discoverDevices();
            console.log('Discovered addresses:', addresses);
            
            if (addresses.length === 0) {
                console.warn('No PCA9685 devices found on the I2C bus');
                return this;
            }

            addresses.forEach(address => {
                console.log(`Initializing address: ${address} (${parseInt(address, 16)})`); // Debug log
                const driver = new PCA9685Class({'address': parseInt(address, 16)});
                this.addDriver(address, driver);
            });

            // Auto-generate initial pin mapping if none exists
            if (Object.keys(storedMapping).length === 0) {
                console.log('No pin mapping exists, generating default mapping');
                this.generateDefaultPinMapping();
            }

            return this;
        } catch (err) {
            console.error('Failed to initialize devices:', err);
            console.error('Error stack:', err.stack);
            return this;
        }
    }

    /**
     * Generate default sequential pin mapping for all discovered devices
     * Creates sequential LED index assignments
     * Maps each driver's pins in order
     * Logs generated mapping for verification
     * @private
     */
    generateDefaultPinMapping() {
        let ledIndex = 0;
        Object.keys(this.drivers).forEach(driverAddr => {
            for (let pin = 0; pin < 16; pin++) {
                this.pinMapping[ledIndex] = {
                    driver: driverAddr,
                    pin: pin
                };
                ledIndex++;
            }
        });
        console.log('Generated default pin mapping:', this.pinMapping);
    }

    /**
     * Add a driver to the pinmapper using its i2c address as identifier
     * Validates address range
     * Stores driver instance for later use
     * 
     * @param {string} address - Driver's I2C address
     * @param {PCA9685} instance - PCA9685 driver instance
     * @throws {Error} If address is invalid
     * @returns {PinMapper} Self reference for chaining
     */
    addDriver(address, instance) {
        
        if (address < PCA9685_BASE_ADDRESS || address > PCA9685_MAX_ADDRESS) {
            throw new Error(`Invalid PCA9685 address: ${address}. Must be between 0x40 and 0x7F`);
        }
        this.drivers[address] = instance;
        console.log(`Successfully added driver at ${address}`);
        return this;
    }

    /**
     * Get all available driver addresses
     * Returns normalized hex addresses
     * 
     * @returns {string[]} Array of hex addresses
     */
    getAvailableDrivers() {
        return Object.keys(this.drivers);
    }

    /**
     * Get a driver instance by its address
     * Normalizes address format
     * Validates driver existence
     * 
     * @param {string} address - Driver address (e.g., '0x40')
     * @returns {Object} Driver instance
     * @throws {Error} If driver not found
     */
    getDriver(address) {
        // Normalize address format
        const normalizedAddr = address.toLowerCase().startsWith('0x') 
            ? address.toLowerCase() 
            : `0x${address.toLowerCase()}`;
            
        const driver = this.drivers[normalizedAddr];
        if (!driver) {
            throw new Error(`Could not find PCA9685 driver by address ${address}. Did you initialize it properly?`);
        }
        return driver;
    }

    /**
     * Normalize address to hex string format
     * Handles both number and string inputs
     * Ensures consistent lowercase format
     * 
     * @param {string|number} address - Address to normalize
     * @returns {string} Normalized hex address
     * @private
     */
    normalizeAddress(address) {
        return typeof address === 'number' 
            ? `0x${address.toString(16).toLowerCase()}`
            : address.toLowerCase();
    }

    /**
     * Find a driver by hex address
     * Normalizes address format
     * Provides detailed error messages
     * 
     * @param {string|number} address - Hex address of driver
     * @returns {PCA9685} Driver instance
     * @throws {Error} If driver not found
     */
    getDriverByAddress(address) {
        
        const normalizedAddr = address.toLowerCase().startsWith('0x') 
            ? address.toLowerCase() 
            : `0x${address.toLowerCase()}`;
            
        if (normalizedAddr in this.drivers) {
            return this.drivers[normalizedAddr];
        }
        throw new Error(`Could not find PCA9685 driver by address ${normalizedAddr} from PinMapper. Did you initialize it properly? Discovered addresses: "${this.getAvailableDrivers().join(', ')}"`);
    }

    /**
     * Configure what pins get what order and update PCA9685 instances
     * Resets all pins to zero
     * Updates pin mapping
     * Initializes mapped pins
     * Clears lookup cache
     * 
     * @param {Array<Object>} mapping - Array of {driver, pin, step} objects
     * @returns {PinMapper} Self reference for chaining
     */
    setPinMapping(mapping) {
        if (!Array.isArray(mapping)) {
            console.error('Invalid mapping format - expected array');
            return this;
        }

        // Reset all pins
        Object.values(this.drivers).forEach(driver => {
            for (let i = 0; i < 16; i++) {
                driver.setPwm(i, 0, 0);
            }
        });

        this.pinMapping = mapping;
        // Clear the lookup cache when mapping changes
        this._lookupCache = null;

        // Initialize all mapped pins to off state
        mapping.forEach(entry => {
            try {
                const driver = this.getDriver(entry.driver);
                if (driver) {
                    driver.setPwm(entry.pin, 0, 0);
                }
            } catch (error) {
                console.warn(`Failed to initialize pin ${entry.pin} on driver ${entry.driver}:`, error);
            }
        });

        return this;
    }

    /**
     * Get a mapped pin by its step number
     * Uses cached lookup for performance
     * Validates step existence
     * 
     * @param {number} step - The step number in the stair sequence
     * @returns {Object} The pin mapping {driver, pin}
     * @throws {Error} If step not found in mapping
     */
    getMappedPin(step) {
        // Build lookup cache if it doesn't exist
        if (!this._lookupCache) {
            this._lookupCache = new Map(
                this.pinMapping.map(entry => [entry.step, entry])
            );
        }

        const mapping = this._lookupCache.get(parseInt(step));
        if (!mapping) {
            throw new Error(`Step ${step} is unknown in current pinMapping`);
        }
        return mapping;
    }

    /**
     * Reverse lookup pin mapping
     * Finds original mapping for given pin
     * 
     * @param {number} pin - Physical pin number
     * @returns {string} Original mapping identifier
     */
    unmap(pin) {
        for(let unmapped in this.pinMapping) {
            if(this.pinMapping[unmapped].pin === pin) {
                return unmapped;
            }
        }
    }

    /**
     * Get stored brightness value for pin
     * Returns 0 if no brightness stored
     * 
     * @param {number} pin - Pin number
     * @returns {number} Brightness value (0-4095)
     */
    getBrightness(pin) {
        return this.brightnesses[pin] || 0;
    }

    /**
     * Controls LED brightness for mapped pins
     * Validates input ranges and pin mapping
     * Caches brightness values for state tracking
     * Handles driver communication errors
     * Prevents duplicate error logging
     * 
     * @param {number} mappedPin - Step number to control (1-21)
     * @param {number} brightness - PWM value (0-4095)
     * @returns {PinMapper} Self reference for chaining
     */
    setBrightness(mappedPin, brightness = 0) {
        if (isNaN(brightness)) {
            // Log ONCE, only for the first error
            if (!this._firstErrorLogged) {
                this._firstErrorLogged = true;
                console.log(`First setBrightness error:`, {
                    mappedPin,
                    brightness,
                    stack: new Error().stack.split('\n')[2]  // Just the caller's line
                });
            }
            return this;
        }

        // Validate inputs
        if (isNaN(brightness) || isNaN(mappedPin)) {
            return this;
        }

        brightness = Math.min(Math.max(brightness, 0), 4095);
        if(brightness < 0) {
            throw new Error("Brightness cannot be negative");
        }
        try {
            const mapped = this.getMappedPin(mappedPin);
            this.brightnesses[mappedPin] = brightness;
            this.getDriver(mapped.driver).setPwm(mapped.pin, 0, brightness);
        } catch (error) {
            // Only log unique errors
            const errorKey = `${mappedPin}-${error.message}`;
            if (!this._reportedErrors?.has(errorKey)) {
                if (!this._reportedErrors) this._reportedErrors = new Set();
                this._reportedErrors.add(errorKey);
                console.warn(`Failed to set brightness for step ${mappedPin}:`, error.message);
            }
        }
        
        return this;
    }

    /**
     * Set all brightnesses to a specific target brightness
     * Updates all mapped steps
     * Maintains consistent brightness across all LEDs
     * 
     * @param {number} brightness - Target brightness (0-4096)
     * @returns {PinMapper} Self reference for chaining
     */
    setAllBrightness(brightness) {
        // Get all unique step numbers from the pin mapping
        const steps = this.pinMapping.map(entry => entry.step);
        
        // Set brightness for each mapped step
        steps.forEach(step => {
            this.setBrightness(step, brightness);
        });
        
        return this;
    }

    /**
     * Set PWM frequency on PCA9685 driver
     * Updates driver frequency setting
     * 
     * @param {number} freq - Target frequency in Hz
     * @returns {PinMapper} Self reference for chaining
     */
    setPWMFrequency(freq) {
        this.driver.setPWMFrequency(freq);
        return this;
    }

    /**
     * Count how many mapped pins there are for easy iteration
     * Returns total number of mapped pins
     * 
     * @returns {number} Total number of mapped pins
     */
    getMappedPinCount() {
        return Object.keys(this.pinMapping).length;
    }

    /**
     * Get pin mapping for specific driver
     * Creates array of pin assignments
     * Fills unmapped pins with null
     * Logs mapping for debugging
     * 
     * @param {string} driver - Driver address
     * @returns {Object} Mapping of physical pins to logical assignments
     */
    getPinMappingForDriver(driver) {
        let output = {}, currentMapping = {};
        for (let pin in this.pinMapping) {
            if(this.pinMapping[pin].driver === driver) {
                currentMapping[this.pinMapping[pin].pin] = pin;
            }
        }
        for(let i=0; i<16; i++) {
            output[i] = currentMapping[i] || null;
        }
        console.log("Pin mapping for driver "+driver+":", output);
        return output;
    }

    /**
     * Tests all mapped pins in sequence
     * Provides visual feedback during testing
     * Validates pin responses
     * Reports test failures individually
     * Displays pin mapping summary before test
     * 
     * @returns {PinMapper} Self reference for chaining
     */
    test() {
        try {
            // Get all steps from the mapping (these are already 1-based)
            const steps = this.pinMapping.map(entry => entry.step);
            
            if (steps.length === 0) {
                console.log('No pins mapped, skipping test');
                return this;
            }

            this.displayPinMappingSummary();
            console.log(`Pin Mapper initialized, Testing ${steps.length} leds:\nOn: `);
            
            // Test turning on using step numbers
            steps.forEach(step => {
                try {
                    process.stdout.write("+");
                    this.setBrightness(step, 1000);
                    sleeper.msleep(50);
                } catch (err) {
                    process.stdout.write("!");
                    console.warn(`Failed to set brightness for step ${step}:`, err.message);
                }
            });

            console.log('\nOff:');
            
            // Test turning off using step numbers
            steps.forEach(step => {
                try {
                    process.stdout.write("-");
                    this.setBrightness(step, 0);
                    sleeper.msleep(50);
                } catch (err) {
                    process.stdout.write("!");
                    console.warn(`Failed to turn off step ${step}:`, err.message);
                }
            });

            console.log("\nPin Mapper test completed");
            return this;
        } catch (error) {
            console.error('Error during pin mapper test:', error);
            return this;
        }
    }

    /**
     * Read configuration from storage
     * Placeholder for configuration loading
     * 
     * @returns {number} Configuration status
     */
    readConfig() {
        return 0;
    }

    /**
     * Save current pin mapping to persistent storage
     * Stores pin mapping and discovered devices
     * 
     * @param {Function} saveCallback - Function to handle actual storage
     * @returns {Promise<void>}
     */
    async saveConfig(saveCallback) {
        const config = {
            pinMapping: this.pinMapping,
            discoveredDevices: this.getAvailableDrivers()
        };
        await saveCallback(config);
    }

    /**
     * Load pin mapping from persistent storage
     * Restores previous pin configuration
     * 
     * @param {Function} loadCallback - Function to handle storage retrieval
     * @returns {Promise<void>}
     */
    async loadConfig(loadCallback) {
        const config = await loadCallback();
        if (config && config.pinMapping) {
            this.pinMapping = config.pinMapping;
        }
    }

    /**
     * Get all mapped LEDs
     * Returns array of physical pin numbers
     * 
     * @returns {Array<number>} Array of LED pin numbers
     */
    getAllLeds() {
        return Object.keys(this.pinMapping).map(pin => this.pinMapping[pin].pin);
    }

    /**
     * Display a summary of all pin mappings grouped by driver address
     * Shows driver-to-pin relationships
     * Validates driver existence
     * Groups pins by driver
     * Handles missing or invalid mappings
     * 
     * @returns {PinMapper} Self reference for chaining
     */
    displayPinMappingSummary() {
        try {
            // Create a map of driver -> pins
            const driverPinMap = {};
            
            // Group pins by driver
            Object.entries(this.pinMapping || {}).forEach(([mappedIndex, config]) => {
                // Skip if config or driver is undefined
                if (!config || !config.driver) {
                    console.warn(`Invalid mapping found for index ${mappedIndex}`);
                    return;
                }
                
                const driver = config.driver;
                if (!driverPinMap[driver]) {
                    driverPinMap[driver] = [];
                }
                
                // Only add if pin is defined
                if (config.pin !== undefined && config.pin !== null) {
                    driverPinMap[driver].push({
                        mappedIndex,
                        pin: config.pin
                    });
                }
            });

            // Display summary
            console.log('\nPin Mapping Summary:');
            Object.entries(driverPinMap).forEach(([driverName, pins]) => {
                try {
                    const driver = this.getDriver(driverName);
                    if (!driver) {
                        console.warn(`Driver ${driverName} not found`);
                        return;
                    }
                    
                    console.log(`\nDriver: ${driverName}`);
                    console.log('Pin -> Mapped Index');
                    console.log('-----------------');
                    
                    if (pins.length === 0) {
                        console.log('No pins mapped');
                        return;
                    }
                    
                    pins.sort((a, b) => a.pin - b.pin)
                        .forEach(({mappedIndex, pin}) => {
                            if (pin !== undefined && pin !== null) {
                                console.log(`${String(pin).padStart(2)} -> ${mappedIndex}`);
                            }
                        });
                } catch (driverError) {
                    console.warn(`Error processing driver ${driverName}:`, driverError.message);
                }
            });

            return this;
        } catch (error) {
            console.error('Error displaying pin mapping summary:', error);
            return this;
        }
    }

    /**
     * Get current pin mappings and driver configuration
     * Returns complete driver state
     * Maps pins to steps for each driver
     * Includes discovered addresses
     * 
     * @returns {Object} Discovered drivers and their pin mappings
     */
    getDriverMappings() {
        const driverData = {};
        const discoveredDrivers = this.getAvailableDrivers();
        
        discoveredDrivers.forEach(driverAddress => {
            driverData[driverAddress] = {};
            
            // Initialize all pins to null (0-15)
            for (let i = 0; i < 16; i++) {
                driverData[driverAddress][i] = null;
            }

            // Fill in configured mappings
            if (Array.isArray(this.pinMapping)) {
                this.pinMapping.forEach(mapping => {
                    if (mapping.driver === driverAddress) {
                        driverData[driverAddress][mapping.pin] = mapping.step;
                    }
                });
            }
        });

        return {
            drivers: driverData,
            discoveredAddresses: discoveredDrivers
        };
    }

    /**
     * Get mapped steps in original configuration order
     * Returns valid integer steps only
     * Preserves original mapping order
     * 
     * @returns {Array<number>} Array of step mappings in original order
     */
    getMappedSteps() {
        return this.pinMapping.map(m => m.step).filter(Number.isInteger);
    }
}
const pinmapper = new PinMapper();
export default pinmapper;   
