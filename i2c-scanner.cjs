/**
 * @file i2c-scanner.js
 * @description Scans the I²C bus for connected devices and attempts identification.
 *
 * @dependencies
 * - i2c: For low-level I²C operations.
 */

const I2C = require('i2c'); // Import the i2c wrapper module.
const i2cBus = new I2C(0, { device: '/dev/i2c-1' }); // Create an instance for bus 1.

/**
 * Attempts to identify known devices by reading typical registers.
 * @param {number} address - The I²C address of the detected device.
 */
function identifyDevice(address) {
    return new Promise((resolve) => {
        i2cBus.setAddress(address);

        // Attempt to read the MODE1 register from a PCA9685 (0x00).
        i2cBus.readByte((err, data) => {
            if (err) {
                console.warn(`Failed to read from 0x${address.toString(16)}: ${err.message}`);
            } else {
                console.log(`PCA9685 detected at 0x${address.toString(16)} (MODE1: 0x${data.toString(16)})`);
            }
            resolve(); // Ensure we resolve the promise either way.
        });
    });
}

/**
 * Scans the I²C bus for connected devices and attempts identification.
 */
function scanI2CBus() {
    console.log('Scanning I²C bus for connected devices...\n');

    i2cBus.scan(async (err, devices) => {
        if (err) {
            console.error(`I²C scan failed: ${err.message}`);
            return;
        }

        if (devices.length === 0) {
            console.log('No devices found on the I²C bus.');
        } else {
            console.log(`Devices found at addresses: ${devices.map(addr => `0x${addr.toString(16)}`).join(', ')}`);
            for (const address of devices) {
                if (address !== 0x00) {
                    await identifyDevice(address); // Wait for each identification to complete.
                } else {
                    console.warn('Skipping invalid address 0x00.');
                }
            }
        }
    });
}

// Execute the scan.
scanI2CBus();
