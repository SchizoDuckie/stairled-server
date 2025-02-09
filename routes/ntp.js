import { execSync } from 'child_process';

/**
 * Time Management and Scheduling System
 * Handles:
 * - Off-time schedule configuration and validation
 * - Emergency shutdown activation
 * - System time synchronization with NTP
 * - Time drift detection and correction
 * - Schedule persistence and loading
 * - Web interface for time management
 */
class NTP {
    /**
     * Initializes time management system
     * Creates schedule storage
     * Prepares for off-time tracking
     */
    constructor() {
        this.offTimes = [];
    }

    /**
     * Binds HTTP and WebSocket routes
     * Sets up configuration endpoints
     * Establishes time sync handlers
     * Creates emergency shutdown routes
     * @param {StairledApp} app - Application instance for route binding
     */
    register(app) {
        app.webServer.get('/ntp', (req, res) => this.handleGetConfig(app, req, res));
        app.webServer.post('/ntp', (req, res) => this.handleUpdateConfig(app, req, res));
        app.webServer.post('/ntp/emergency-off', (req, res) => this.handleEmergencyOff(app, req, res));
        app.webServer.post('/ntp/sync-time', (req, res) => this.handleTimeSync(app, req, res));
    }

    /**
     * Renders NTP configuration interface
     * Loads current off-time schedules
     * Displays active time settings
     * Shows emergency shutdown status
     * @param {StairledApp} app - Application instance for config access
     * @param {Request} req - Express request
     * @param {Response} res - Express response for page render
     */
    handleGetConfig(app, req, res) {
        res.render('ntp', {
            offTimes: app.config.get('ntp:offTimes') || []
        });
    }

    /**
     * Processes off-time schedule updates
     * Validates time format and ranges
     * Persists valid configurations
     * Redirects on success
     * Returns error JSON on failure
     * @param {StairledApp} app - Application instance for config storage
     * @param {Request} req - Express request with schedule data
     * @param {Response} res - Express response for result handling
     */
    handleUpdateConfig(app, req, res) {
        try {
            const offTimes = [];
            
            for (let i = 0; i < 3; i++) {
                offTimes.push({
                    enabled: req.body[`enable${i}`] === 'on',
                    start: req.body[`start${i}`] || '00:00',
                    end: req.body[`end${i}`] || '00:00'
                });
            }

            const validOffTimes = this.validateOffTimes(offTimes);
            
            app.config.set('ntp:offTimes', validOffTimes);
            app.config.save();
            
            res.redirect('/ntp');
        } catch (error) {
            console.error('NTP config error:', error);
            res.status(400).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Activates emergency shutdown mode
     * Creates 12-hour off period
     * Preserves existing schedules
     * Updates configuration immediately
     * Redirects to status page
     * @param {StairledApp} app - Application instance for schedule management
     * @param {Request} req - Express request
     * @param {Response} res - Express response for redirect
     */
    handleEmergencyOff(app, req, res) {
        try {
            const now = new Date();
            const endTime = new Date(now.getTime() + (12 * 60 * 60 * 1000));
            
            const formatTime = (date) => 
                `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

            const existingTimes = app.config.get('ntp:offTimes') || [];
            const emergencyTime = {
                enabled: true,
                start: formatTime(now),
                end: formatTime(endTime)
            };

            const newOffTimes = [
                ...existingTimes.slice(0, 2),
                emergencyTime
            ].filter(t => t).slice(0, 3);

            const validTimes = this.validateOffTimes(newOffTimes);
            app.config.set('ntp:offTimes', validTimes);
            app.config.save();

            res.redirect('/ntp');
        } catch (error) {
            console.error('Emergency off failed:', error);
            res.status(500).redirect('/ntp');
        }
    }

    /**
     * Synchronizes system time with client
     * Validates timestamp plausibility
     * Corrects drift over 5 minutes
     * Updates system time if needed
     * Returns drift metrics
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request with client time
     * @param {Response} res - Express response with sync results
     */
    handleTimeSync(app, req, res) {
        try {
            const clientTime = new Date(req.body.clientTime);
            const serverTime = new Date();
            
            if (!this.isPlausibleTime(clientTime)) {
                return res.status(400).json({ error: 'Invalid time format' });
            }

            const timeDelta = clientTime - serverTime;
            
            if (Math.abs(timeDelta) > 300000) {
                console.log(`Correcting time drift: ${timeDelta}ms`);
                execSync(`sudo date -s "@${Math.floor(clientTime.getTime()/1000)}"`);
                return res.json({ success: true, corrected: timeDelta });
            }
            
            res.json({ success: true, drift: timeDelta });
        } catch (e) {
            console.error('Time sync failed:', e);
            res.status(500).json({ error: 'Time synchronization failed' });
        }
    }

    /**
     * Validates off-time schedule entries
     * Checks time format validity
     * Ensures times are within 24-hour range
     * Filters invalid entries
     * Normalizes time formats
     * @param {Array<Object>} times - Raw schedule entries
     * @returns {Array<Object>} Sanitized valid schedules
     * @throws {Error} On invalid format or structure
     */
    validateOffTimes(times) {
        if (!Array.isArray(times)) {
            throw new Error('Invalid times format');
        }

        return times
            .map(t => ({
                enabled: Boolean(t.enabled),
                start: t.start?.substring(0, 5) || '00:00',
                end: t.end?.substring(0, 5) || '00:00'
            }))
            .filter(t => {
                const [startH, startM] = t.start.split(':').map(Number);
                const [endH, endM] = t.end.split(':').map(Number);
                return startH < 24 && startM < 60 && endH < 24 && endM < 60;
            });
    }

    /**
     * Validates timestamp sanity
     * Checks year range (2023-2030)
     * Verifies month bounds
     * Ensures date structure
     * @param {Date} timestamp - Time to validate
     * @returns {boolean} True if timestamp is plausible
     */
    isPlausibleTime(timestamp) {
        const date = new Date(timestamp);
        return date.getFullYear() >= 2023 && 
               date.getFullYear() <= 2030 &&
               date.getMonth() >= 0 &&
               date.getMonth() <= 11;
    }
}

export default new NTP(); 