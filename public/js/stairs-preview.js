// public/js/stairs-preview.js

/**
 * StairsPreview class handles the 3D staircase preview functionality.
 * It manages the rotation and interaction of the staircase preview.
 */
class StairsPreview {
    constructor() {
        this.previewContainer = document.querySelector('.preview-container');
        this.rotationX = 338;
        this.rotationY = 20;
        this.isDragging = false;

        this.init();
    }

    /**
     * Initialize the event listeners for the stairs preview.
     */
    init() {
        this.previewContainer.addEventListener('mousedown', () => {
            this.isDragging = true;
        });

        window.addEventListener('mousemove', (event) => this.updateRotation(event));
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    /**
     * Update the rotation of the stairs preview based on mouse movement.
     * @param {MouseEvent} event - The mouse event containing movement data.
     */
    updateRotation(event) {
        if (this.isDragging) {
            this.rotationY += event.movementX * 0.5;
            this.rotationX -= event.movementY * 0.5;
            this.rotationX = Math.max(0, Math.min(360, this.rotationX));
            this.previewContainer.style.transform = `rotateX(${this.rotationX}deg) rotateY(${this.rotationY}deg)`;
        }
    }
}

// Initialize the StairsPreview when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new StairsPreview();
});