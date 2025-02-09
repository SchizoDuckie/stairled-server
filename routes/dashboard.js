import CRUD from "../db/CRUD.js";
import StairLog from "../db/entities/Stairlog.js";

/**
 * Manages dashboard route functionality including:
 * - Root path redirection to dashboard
 * - Dashboard page rendering
 * - Stair sensor statistics display
 * - Trigger count aggregation
 */
class Dashboard {
    /**
     * Registers all dashboard routes with the application
     * Sets up root redirect and main dashboard view
     * @param {Express} app - Express application instance
     */
    register(app) {        
        app.webServer.get('/', (req, res) => this.handleRoot(req, res));
        app.webServer.get('/dashboard', (req, res) => this.handleDashboard(req, res));
    }

    /**
     * Handles root path requests
     * Redirects all root path traffic to dashboard page
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    handleRoot(req, res) {
        res.redirect('/dashboard');
    }

    /**
     * Handles dashboard page requests
     * Fetches and displays stair sensor statistics
     * Aggregates trigger counts for up/down sensors
     * Renders dashboard template with sensor data
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async handleDashboard(req, res) {
        let downstairs = 0;
        let upstairs = 0;

        try {
            downstairs = await CRUD.FindCount(StairLog, {"sensorname": "Sensor Downstairs"}) || 0;
            upstairs = await CRUD.FindCount(StairLog, {"sensorname": "Upstairs"}) || 0;
        } catch (error) {
            console.error("Error fetching trigger counts:", error);
        }

        console.log("Down triggers:", downstairs);
        console.log("Up triggers:", upstairs);

        // TODO: Implement logic for fastest and slowest times
        // For now, we'll use placeholder values

        res.render('dashboard', {
            "downtriggers": downstairs,
            "uptriggers": upstairs,
            "fastestTime": "N/A", // Placeholder
            "slowestTime": "N/A"  // Placeholder
        });
    }
}

export default new Dashboard();
