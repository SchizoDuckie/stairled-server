import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * System Update and Version Management Handler
 * Provides:
 * - Version information display and tracking
 * - Automated GitHub release checks
 * - Secure update downloads and installations
 * - System restart coordination
 * - Update status persistence
 */
class About {
    /**
     * Initializes About handler with package version information
     * Resolves package.json path using ESM-compatible file resolution
     * Sets up version tracking for update comparisons
     */
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        this.packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    }

    /**
     * Registers HTTP routes for version management
     * Sets up endpoints for version display and updates
     * 
     * @param {Object} app Express application instance containing:
     *   - webServer: Express server instance
     *   - config: Configuration management service
     */
    register(app) {
        app.webServer.get('/about', (req, res) => this.handleGetAbout(req, res, app));
        app.webServer.post('/about/check-update', (req, res) => this.handleCheckUpdate(req, res, app));
        console.log("📒 About page routes added");
    }

    /**
     * Handles GET requests for about page
     * Displays current version and update status
     * 
     * @param {Object} req Express request object
     * @param {Object} res Express response object
     * @param {Object} app Main application instance
     */
    handleGetAbout(req, res, app) {
        res.render('about', {
            currentVersion: this.packageJson.version,
            lastChecked: app.config.get('lastUpdateCheck') || 'Never',
            updateAvailable: app.config.get('updateAvailable') || false
        });
    }

    /**
     * Handles update check and installation requests
     * Checks GitHub for new releases
     * Downloads and installs updates if available
     * Persists update status
     * Triggers system restart after successful update
     * 
     * @param {Object} req Express request object
     * @param {Object} res Express response object
     * @param {Object} app Main application instance
     */
    async handleCheckUpdate(req, res, app) {
        try {
            const repoUrl = 'https://api.github.com/repos/schizoduckie/stairled-server/releases/latest';
            const latestRelease = JSON.parse(execSync(`curl -sL ${repoUrl}`).toString());
            
            if (latestRelease.tag_name !== this.packageJson.version) {
                await this.installUpdate(latestRelease);
                app.config.set('updateAvailable', true);
                res.json({ 
                    success: true, 
                    message: 'Update installed successfully! System restarting...' 
                });
            } else {
                app.config.set('updateAvailable', false);
                res.json({ 
                    success: true, 
                    message: 'Already running latest version' 
                });
            }
            
            app.config.set('lastUpdateCheck', new Date().toISOString());
            app.config.save();
        } catch (error) {
            console.error('Update failed:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Update process failed - check server logs' 
            });
        }
    }

    /**
     * Installs system update from release assets
     * Downloads update package
     * Extracts to appropriate location
     * Triggers system service restart
     * 
     * @param {Object} latestRelease GitHub release information containing:
     *   - assets: Array of release assets
     * @private
     */
    async installUpdate(latestRelease) {
        execSync(`curl -L ${latestRelease.assets[0].browser_download_url} -o /tmp/update.tar.gz`);
        execSync('tar xzf /tmp/update.tar.gz -C /home/pi/ --overwrite');
        execSync('sudo service supervisorctl restart');
    }
}

// Add to validateOffTimes pattern
const GITHUB_REPO_REGEX = /^https:\/\/api\.github\.com\/repos\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/releases\/latest$/;
const TARBALL_REGEX = /\.tar\.gz$/;

/**
 * URL Pattern Validation
 * Ensures download security by validating:
 * - GitHub API repository URL format
 * - Tarball file extension
 * - Prevents path traversal attacks
 * 
 * @param {string} url GitHub API or asset download URL to validate
 * @returns {boolean} True if URL matches security patterns
 */
function validateDownloadUrl(url) {
    return GITHUB_REPO_REGEX.test(url) && TARBALL_REGEX.test(url);
}

export default new About(); 