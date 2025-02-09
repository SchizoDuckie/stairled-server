/**
 * Manages animation-related routes and configurations including:
 * - Animation step configuration retrieval
 * - Animation configuration persistence
 * - Dynamic animation reinitialization
 * - Web interface routing for animation management
 */
class Animations {
    /**
     * Registers animation-related routes with the web server
     * Sets up GET and POST endpoints for animation configuration
     * 
     * @param {Object} app Main application instance containing:
     *   - webServer: Express server instance
     *   - pinMapper: Pin mapping service
     *   - animations: Animation collection
     *   - config: Configuration management service
     *   - initAnimations: Animation initialization function
     */
    register(app) {
        app.webServer.get('/animations/steps', (req, res) => this.handleGetAnimationSteps(req, res, app));
        app.webServer.post('/animations/steps', (req, res) => this.handlePostAnimationSteps(req, res, app));
        
        console.log("🎬 Animation configuration routes added");
    }

    /**
     * Handles GET requests for animation step configuration
     * Retrieves current pin mapping and animation configurations
     * Renders animation-steps template with current state
     * 
     * @param {Object} req Express request object
     * @param {Object} res Express response object
     * @param {Object} app Main application instance
     */
    handleGetAnimationSteps(req, res, app) {
        const pinMapping = app.pinMapper.getPinMapping();
        const animations = Object.entries(app.animations).map(([name, animation]) => ({
            name,
            description: animation.description,
            stepConfig: animation.stepConfig
        }));

        res.render('animation-steps', {
            animations,
            pinMapping
        });
    }

    /**
     * Handles POST requests for animation step configuration
     * Updates animation configuration in persistent storage
     * Reinitializes animations with new configuration
     * Redirects to animation steps page after update
     * 
     * @param {Object} req Express request object containing:
     *   - body.animationName: Name of animation to update
     *   - body.stepGroups: New step configuration
     * @param {Object} res Express response object
     * @param {Object} app Main application instance
     */
    handlePostAnimationSteps(req, res, app) {
        const { animationName, stepGroups } = req.body;
        
        // Update animation configuration
        const config = app.config.get('animations') || {};
        config[animationName] = {
            ...config[animationName],
            stepConfig: stepGroups
        };
        
        app.config.set('animations', config);
        app.config.save();
        
        // Reinitialize animations
        app.animations = app.initAnimations(app.pinMapper);
        
        res.redirect('/animations/steps');
    }
}

export default new Animations(); 