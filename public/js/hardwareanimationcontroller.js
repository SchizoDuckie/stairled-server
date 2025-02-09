// public/js/hardwareanimationcontroller.js

/**
 * HardwareAnimationController class handles hardware-specific functionality
 * like starting, stopping, and clearing animations on the hardware.
 */
export default class HardwareAnimationController {
    constructor() {
        // Initialize any hardware-specific setup here
    }

    /**
     * Start an animation on the hardware.
     * @param {string} animationName - The name of the animation.
     * @param {Object} config - The animation configuration.
     */
    async startAnimation(animationName, config) {
        // Logic to start the animation on hardware
        console.log(`Starting animation "${animationName}" on hardware with config:`, config);
        // Example: Send a request to the hardware API
        try {
            const response = await fetch('/animation/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    animationName: animationName,
                    config: config
                })
            });
            const result = await response.json();
            if (result.success) {
                console.log('Animation started on hardware.');
            } else {
                console.error('Error starting animation on hardware:', result.error);
            }
        } catch (error) {
            console.error('Error starting animation on hardware:', error);
        }
    }

    /**
     * Stop the current animation on the hardware.
     */
    async stopAnimation() {
        // Logic to stop the animation on hardware
        console.log('Stopping animation on hardware.');
        try {
            const response = await fetch('/animation/stop', {
                method: 'POST',
            });
            const result = await response.json();
            if (result.success) {
                console.log('Animation stopped on hardware.');
            } else {
                console.error('Error stopping animation on hardware:', result.error);
            }
        } catch (error) {
            console.error('Error stopping animation on hardware:', error);
        }
    }

    /**
     * Clear the current animation and turn off all LEDs on the hardware.
     */
    async clearAnimation() {
        // Logic to clear the animation and turn off LEDs on hardware
        console.log('Clearing animation and turning off LEDs on hardware.');
        try {
            const response = await fetch('/animation/clear', {
                method: 'POST',
            });
            const result = await response.json();
            if (result.success) {
                console.log('Animation cleared and LEDs turned off on hardware.');
            } else {
                console.error('Error clearing animation on hardware:', result.error);
            }
        } catch (error) {
            console.error('Error clearing animation on hardware:', error);
        }
    }
}