/**
 * PWM Controller Management System
 * Handles:
 * - Real-time PWM signal generation
 * - Multi-driver coordination
 * - Pin mapping configuration
 * - Driver address management
 * - Web interface for pin setup
 * - WebSocket-based PWM control
 * - Configuration persistence
 */
class Pca9685 {
    /**
     * Initializes PWM controller system
     * Prepares driver management
     * Sets up configuration handlers
     */
    constructor() {
        // No initialization needed currently
    }

    /**
     * Binds HTTP and WebSocket routes
     * Creates pin mapping endpoints
     * Establishes real-time PWM controls
     * Sets up configuration interface
     * @param {StairledApp} app - Application instance for route binding
     */
    register(app) {
        app.webServer.get('/pca9685', (req, res) => this.handleGetPinMapping(app, req, res));
        app.webServer.post('/pca9685', (req, res) => this.handleSavePinMapping(app, req, res));
        app.webSocketServer.addHandler('setPWM', (address, ports, value) => 
            this.handleSetPWM(app, address, ports, value));
    }

    /**
     * Renders pin mapping interface
     * Loads available driver configurations
     * Displays current pin assignments
     * Shows driver status information
     * Logs driver availability for debugging
     * @param {StairledApp} app - Application instance for driver access
     * @param {Request} req - Express request
     * @param {Response} res - Express response for page render
     */
    handleGetPinMapping(app, req, res) {
        const availableDrivers = app.pinMapper.getDriverMappings();
        console.log('Available drivers:', availableDrivers);  // Debug output
        res.render('pca9685', availableDrivers);
    }

    /**
     * Updates pin mapping configuration
     * Validates mapping structure
     * Checks pin number ranges (0-15)
     * Verifies step values
     * Persists valid configurations
     * Logs validation results
     * Returns errors for invalid data
     * @param {StairledApp} app - Application instance for config storage
     * @param {Request} req - Express request with mapping data
     * @param {Response} res - Express response for result handling
     */
    handleSavePinMapping(app, req, res) {
        console.log("\n=== Processing Pin Mapping POST ===");
        console.log("Raw POST data:", req.body);
        
        const { mappings } = req.body;
        
        if (!Array.isArray(mappings) || mappings.length === 0) {
            console.error("No mappings received");
            return res.status(400).json({ error: "No mappings provided" });
        }

        // Basic validation of required fields and data types
        const validMappings = mappings.filter(m => 
            m && 
            typeof m.driver === 'string' &&
            Number.isInteger(m.pin) && m.pin >= 0 && m.pin <= 15 &&
            Number.isInteger(m.step) && m.step > 0
        );

        if (validMappings.length === 0) {
            console.error("No valid mappings found");
            return res.status(400).json({ error: "Invalid mapping data" });
        }

        console.log("Saving mappings:", validMappings);
        app.pinMapper.setPinMapping(validMappings);
        app.config.set('pinmapper:mapping', validMappings);
        app.config.save();
        
        res.redirect('/pca9685');
    }

    /**
     * Controls PWM signal generation
     * Updates multiple ports simultaneously
     * Validates driver address
     * Converts port strings to numbers
     * Filters invalid port values
     * Handles individual port failures
     * Logs all operations for debugging
     * @param {StairledApp} app - Application instance for driver access
     * @param {string} address - Target driver identifier
     * @param {string} ports - Comma-separated port numbers to update
     * @param {string|number} value - PWM value to set (0-4095)
     */
    handleSetPWM(app, address, ports, value) {
       
        const driver = app.pinMapper.getDriverByAddress(address);
        if (!driver) {
            console.error(`Invalid driver address: ${address}`);
            return;
        }

        // Convert ports to numbers once and filter invalid values
        const portNumbers = ports
            .split(',')
            .map(p => parseInt(p, 10))
            .filter(p => !isNaN(p) && p >= 0 && p < 16);
        
       
        // Fallback to individual updates
        portNumbers.forEach(port => {
            try {
                driver.setPwm(port, 0, parseInt(value));
            } catch (err) {
                console.error(`Failed to set PWM for port ${port}:`, err);
                console.error(`Port: ${port} (${typeof port})`);
                console.error(`Value: ${value} (${typeof value})`);
            }
        });
    }
}

export default new Pca9685();