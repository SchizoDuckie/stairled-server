import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import StairAnimation from "../animations/StairAnimation.js";
import { eventBus, Events } from './EventBus.js';

class AnimationService {
    constructor() {
        this.animations = new Map();
        this.animationsPath = path.join(process.cwd(), 'config', 'animations');
        this.dirHash = null;
    }

    /**
     * Generate a hash of the directory contents for quick change detection
     * @returns {Promise<string>} MD5 hash of directory state
     */
    async #generateDirHash() {
        try {
            const files = await fs.readdir(this.animationsPath);
            const hash = crypto.createHash('md5');
            
            for (const file of files) {
                if (path.extname(file) === '.json') {
                    const stat = await fs.stat(path.join(this.animationsPath, file));
                    hash.update(file + stat.mtimeMs.toString());
                }
            }
            
            return hash.digest('hex');
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, `AnimationService hash generation failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Check for changes and reload animations if needed
     * @returns {Promise<boolean>} true if changes were detected
     */
    async #checkForChanges() {
        const currentHash = await this.#generateDirHash();
        
        if (currentHash && currentHash !== this.dirHash) {
            this.dirHash = currentHash;
            return true;
        }
        return false;
    }

    /**
     * Get list of animations with automatic reload if changes detected
     * @returns {Promise<Array<{key: string, name: string, description: string}>>}
     */
    async getAnimationsList() {
        const hasChanges = await this.#checkForChanges();
        
        if (hasChanges || this.animations.size === 0) {
            await this.#loadAnimations();
        }
        
        return Array.from(this.animations.entries()).map(([key, anim]) => ({
            key,
            name: anim.name,
            description: anim.description
        }));
    }

    /**
     * Internal loader that preserves existing instances when possible
     */
    async #loadAnimations() {
        try {
            const files = await fs.readdir(this.animationsPath);
            const newAnimations = new Map();

            for (const file of files) {
                if (path.extname(file) === '.json') {
                    const name = path.basename(file, '.json');
                    
                    try {
                        // Reuse existing animation if config hasn't changed
                        if (!this.animations.has(name)) {
                            const config = await fs.readFile(path.join(this.animationsPath, file), 'utf8');
                            newAnimations.set(name, new StairAnimation({
                                name: name,
                                ...JSON.parse(config)
                            }));
                        } else {
                            newAnimations.set(name, this.animations.get(name));
                        }
                    } catch (error) {
                        eventBus.emit(Events.SYSTEM_ERROR, `Failed to load animation ${file}: ${error.message}`);
                    }
                }
            }

            this.animations = newAnimations;
            console.log('Loaded animations:', Array.from(newAnimations.keys()));
            eventBus.emit(Events.SYSTEM_INFO, `Loaded ${newAnimations.size} animations`);
            
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, `AnimationService failed to load: ${error.message}`);
        }
    }
}

export const animationService = new AnimationService(); 