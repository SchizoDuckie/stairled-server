
/**
 * Manages all PCA9685 LED drivers and their interactions
 */
class DriverManager {
    /**
     * @param {WebSocket} socket - WebSocket connection for sending PWM commands
     */
    constructor(socket) {
        this.socket = socket;
        this.drivers = new Map();
        this.initialize();
    }

    initialize() {
        $('.pca9685').each((_, element) => {
            const driver = new DriverController(element, this.socket);
            driver.setManager(this);
            this.drivers.set(driver.driverId, driver);
        });
    }

    /**
     * Update brightness for all linked drivers
     * @param {number} brightness - New brightness value
     * @param {DriverController} source - Driver that initiated the change
     */
    updateLinkedBrightness(brightness, source) {
        this.drivers.forEach(driver => {
            if (driver.isLinked()) {
                driver.setBrightness(brightness);
            }
        });
    }

    /**
     * Get the next available step number across all drivers
     * @returns {number} Next available step number
     */
    getNextStepNumber() {
        let maxStep = 0;
        this.drivers.forEach(driver => {
            driver.rows.forEach(row => {
                if (row.checkbox.is(':checked')) {
                    const stepNum = parseInt(row.input.val());
                    if (!isNaN(stepNum) && stepNum > maxStep) {
                        maxStep = stepNum;
                    }
                }
            });
        });
        return maxStep === 0 ? 1 : maxStep + 1;
    }
}