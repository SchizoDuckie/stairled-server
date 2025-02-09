/*
 * Patched version of adafruit-pca9685
 * Adds batch operation support for improved performance using ALL CALL address
 */

import originalMakePwm from 'adafruit-pca9685';

// PCA9685 ALL CALL address for broadcasting
const __ALL_CALL_ADDR = 0x70;  // Broadcast address for all PCA9685 devices

function makePwm(arg_map) {
    const pwm = originalMakePwm(arg_map);

    /**
     * Sets PWM values for channels across all devices using ALL CALL
     * @param {number[]} channels - Array of channel numbers (0-15)
     * @param {number} pulseon - On time (0-4095)
     * @param {number} pulseoff - Off time (0-4095)
     */
    pwm.setPwmBatch = function(channels, pulseon, pulseoff) {
        // Create broadcast PWM controller
        const broadcastPwm = originalMakePwm({ address: __ALL_CALL_ADDR, device: pwm.i2c.device });
        
        // Use original setPwm method for each channel through broadcast address
        channels.forEach(channel => {
            broadcastPwm.setPwm(channel, pulseon, pulseoff);
        });
    };

    return pwm;
}

export default makePwm;