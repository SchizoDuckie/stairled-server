// public/js/AnimationController.js

import StairAnimation from './animations/StairAnimation.js';
import HardwareAnimationController from './hardwareanimationcontroller.js';

/**
 * AnimationController class handles the form submission, timeline management,
 * and browser previews for animation configurations.
 */
export default class AnimationController {
    constructor(availableSteps) {
        if (AnimationController.instance) {
            return AnimationController.instance;
        }
        AnimationController.instance = this;

        this.initializeController(availableSteps);
    }

    /** 
     * Initialize all controller functionality
     * @private
     */
    initializeController(availableSteps) {
        window.addEventListener('load', () => {
            this.hardwareController = new HardwareAnimationController();
            this.currentAnimation = null;
            this.timelineItems = [];
            this.currentEditingIndex = null;
            this.availableSteps = availableSteps;

            this.compileTemplates();
            this.initializeEventHandlers();
            this.initTimeline();
            
            // New code: Check for overlaps on initial load
            this.checkAndHandleOverlaps();
        });
    }

    /**
     * Set up all event listeners using document-level delegation
     * @private
     */
    initializeEventHandlers() {
        // Form submission
        $(document)
            .on('submit', '#effectsForm', (event) => this.handleFormSubmit(event))
            .on('change', '#animationSelect', (event) => this.handleAnimationChange(event));
            
        // Control buttons
        $(document)
            .on('click', '#previewBrowserButton', () => this.previewBrowser())
            .on('click', '#previewHardwareButton', () => this.previewHardware())
            .on('click', '#stopAnimationButton', () => this.stopAnimation())
            .on('click', '#clearAnimationButton', () => this.clearAnimation())
            .on('click', '#addTimelineItem', () => this.addNewTimelineItem())
            .on('click', '#createNewAnimation', () => this.createNewAnimation())
            .on('click', '.timeline-bar .play-item', (e) => { 
                let justThisOne = $(e.currentTarget).closest('.timeline-bar').data('json');
                this.previewBrowser(justThisOne);        
            } );

        // Timeline editing
        $(document)
            .on('click', '.edit-item', (e) => this.handleEditItemClick(e))
            .on('click', '.delete-item', (e) => this.deleteTimelineItem(e))
            .on('click', '#saveTimelineChanges', (e) => this.saveTimelineChanges(e))
            .on('change', '#editItemType', (e) => this.handleTypeChange(e));

        // Add bulk selection handler to existing delegation
        $(document)
            .on('click', 'a.bulk-select', (e) => this.handleBulkSelection(e))
            .on('change', '.step-checkboxes input[type=checkbox]', (e) => this.handleStepSelectCheckboxChange(e))
            .on('input', '.step-selection input[name=selectedSteps]', (e) => this.handleSelectedStepsInputChange(e));
            
    
            // Create observer instance
            const observer = new MutationObserver((mutations) => {
                console.log("Something changed in the timeline container", mutations);
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        mutation.attributeName === 'data-json' &&
                        mutation.target.classList.contains('timeline-bar')) {
                        
                        // Custom logic when data-json changes
                        const newValue = mutation.target.getAttribute('data-json');
                        console.log('data-json changed:', newValue);
                        // Add your change handler logic here
                    }
                });
            });

            // Start observing the document body
            observer.observe(document.querySelector('.timeline-container'), {
                attributes: true,
                attributeFilter: ['data-json'],
                subtree: true,
                childList: true,
            });            
    }

    /**
     * Handle timeline item edit clicks
     * @private
     */
    handleEditItemClick(e) {
        const item = $(e.currentTarget).closest('.timeline-bar');
        this.currentEditingIndex = item.index();
        if(!item.data('json').options.leds) {
            item.data('json').options.leds = this.availableSteps;
        }
        
        // Render modal with context
        const modalHtml = Handlebars.partials['timeline-items-modal']({
            ...item.data('json'),
            animationTypes: window.animationTypes,
            availableSteps: this.availableSteps,
            selectedSteps: item.data('json').options.leds.join(',')
        });
        
        $('#timelineItemModal').remove();
        $('body').append(modalHtml);
        this.handleTypeChange({target: document.getElementById('editItemType')});
        $('#timelineItemModal').modal('show');
    }

    /**
     * Handle type change in modal
     * @private
     */
    handleTypeChange(e) {
        const type = $(e.target).val();
        console.log('Type changed to:', type);  // Add logging
        
        // Toggle visibility using proper selectors
        $('.type-specific').each(function() {
            const validTypes = $(this).data('type').split(',');
            $(this).toggle(validTypes.includes(type));
        });
    }

    /**
     * Create a new animation with name and description
     * @public
     */
    createNewAnimation() {
        // Render modal template
        const modalHtml = Handlebars.partials['create-animation-modal']({});
        $('#createAnimationModal').remove();
        $('body').append(modalHtml);
        
        const modal = new bootstrap.Modal(document.getElementById('createAnimationModal'));
        modal.show();
        
        // Handle form submission
        $('#createAnimationForm').off('submit').on('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const name = formData.get('animationName').trim();
            const description = formData.get('animationDescription').trim();
            
            if (!name) {
                alert('Animation name is required');
                return;
            }
            
            // Add to select with description
            $('#animationSelect').append($('<option>', {
                value: name,
                'data-description': description,
                text: `${name} - ${description}`
            }));
            
            $('#animationSelect').val(name);
            $('#timelineBars').empty();
            modal.hide();
        });
    }

    /**
     * Save timeline changes from modal
     * @private
     */
    saveTimelineChanges(e) {
        const formData = new FormData(e.target.form);
        let data = Object.fromEntries(formData.entries());
        
        // Convert numeric values explicitly
        const numericFields = ['at', 'duration', 'brightness', 'start', 'end', 'bounceAfter','shifts'];
        numericFields.forEach(field => {
            if (data[field]) data[field] = parseInt(data[field]);
        });
        if(data['bouncing']) {
            data['bouncing'] = data['bouncing'] === '1';
        }
        if(data.type === 'Immediate') { // h4ck h4ck, sue me.
            data.duration = 0;
        }

        let templateData = {
            type: data.type,
            startTime: data.at,
            at: data.at,
        };

        delete data.type;
        delete data.at;
        data.leds = data.selectedSteps.split(',').map(s => parseInt(s));
        delete data.selectedSteps;
        templateData.options = data;
        
        // Render using precompiled template
        const html = Handlebars.partials['timeline-item-template'](templateData);

        if (this.currentEditingIndex !== null) {
            // Select by DOM position
            const existingItem = $(`#timelineBars > .timeline-bar:eq(${this.currentEditingIndex})`);
            existingItem.replaceWith(html);
            this.currentEditingIndex = null;
        } else {
            $('#timelineBars').append(html);
        }

        this.updateTimelineOrder();

        $('#timelineItemModal').modal('hide');
    }

    /**
     * Compile Handlebars templates once
     */
    compileTemplates() {
        const timelineTemplateEl = document.getElementById('timeline-item-template');
        const modalTemplateEl = document.getElementById('timeline-items-modal');
        const createModalEl = document.getElementById('create-animation-modal');
        
        Handlebars.registerPartial('timeline-item-template', Handlebars.compile(timelineTemplateEl.innerHTML));
        Handlebars.registerPartial('timeline-items-modal', Handlebars.compile(modalTemplateEl.innerHTML));
        Handlebars.registerPartial('create-animation-modal', Handlebars.compile(createModalEl.innerHTML));
    }

    /**
     * Handle form submission for saving the animation configuration.
     * @param {Event} event - The form submission event.
     */
    async handleFormSubmit(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        const config = await this.getAnimationConfig();
        config.name = formData.get('animationName');
        await this.saveConfiguration(config);
    }

    /**
     * Save the animation configuration to the server.
     * @param {Object} data - The animation configuration data.
     */
    async saveConfiguration(data) {
        try {
            const response = await fetch('/effects/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (result.success) {
                alert('Configuration saved successfully!');
            } else {
                alert('Error saving configuration: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error saving configuration');
        }
    }

    /**
     * Handle the animation selection change by reloading the page with new animation parameter
     * @async
     */
    async handleAnimationChange() {
        const animationSelect = document.getElementById('animationSelect');
        if (animationSelect) {
            const selectedAnimation = animationSelect.value;
            // Add proper encoding and ensure query parameter is set
            window.location.href = `/effects?animation=${encodeURIComponent(selectedAnimation)}`;
        }
    }

    /**
     * Preview the animation in the browser.
     */
    async previewBrowser(justThisOne = false) {
        let config;
        if(!justThisOne) {
            config = await this.getAnimationConfig();
        } else {
            justThisOne.at = 0;
            config = {
                name: 'just one',
                timeline: [justThisOne]
            }
        };

        // Stop any existing animation
        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }

        // Create a new animation
        this.currentAnimation = new StairAnimation({
            name: config.name,
            ...config
        })
        //this.currentAnimation.setEasingFunction(document.getElementById('easingSelect').value);


        // Start the animation
        this.currentAnimation.start();
    }

    /**
     * Get the current animation configuration from the form.
     * @returns {Object} - The animation configuration with description.
     */
    async getAnimationConfig() {
        const animationSelect = document.getElementById('animationSelect');
        const animationName = animationSelect.value;
        const selectedOption = animationSelect.options[animationSelect.selectedIndex];
        const description = selectedOption.dataset.description || '';

        const formData = new FormData(document.getElementById('effectsForm'));
        const config = {
            name: animationName,
            description: description,
            timeline: []
        };

        // Build timeline array from form data
        const timelineElements = document.querySelectorAll('.timeline-container .timeline-bar');
        timelineElements.forEach((element, index) => {
            const json = JSON.parse(element.getAttribute('data-json'));

            config.timeline.push(json);

            /*
            config.timeline.push({
                type: type,
                at,
                options: {
                    duration,
                    end,
                    start: type === 'FadeIn' || type === 'FadeOut' ? start : undefined,
                    brightness: type === 'Sequence' || type === 'FadeTo' ? end : undefined,
                    leds
                } 
            });*/
        });

        return config;
    }

    /**
     * Preview the animation on hardware.
     */
    async previewHardware() {
        const config = await this.getAnimationConfig();
        await this.hardwareController.startAnimation(config.name, config);
    }

    /**
     * Stop the current animation.
     */
    async stopAnimation() {
        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }
        await this.hardwareController.stopAnimation();
    }

    /**
     * Clear the current animation and turn off all LEDs.
     */
    async clearAnimation() {
        if (this.currentAnimation) {
            this.currentAnimation.stop();
            this.currentAnimation = null;
        }
        pinMapper.setAllBrightness(0);
        await this.hardwareController.clearAnimation();
    }

    /**
     * Initialize timeline drag & drop functionality
     */
    initTimeline() {
        const container = $('#timelineBars');
        
        container
            .on('dragstart', '.timeline-bar', (e) => {
                e.target.classList.add('dragging');
            })
            .on('dragend', '.timeline-bar', (e) => {
                e.target.classList.remove('dragging');
                this.updateTimelineOrder();
            })
            .on('dragover', (e) => {
                e.preventDefault();
                const draggable = $('.dragging')[0];
                if (!draggable) return;

                const afterElement = this.getDragAfterElement(container[0], e.clientY);
                if (afterElement) {
                    $(draggable).insertBefore(afterElement);
                } else {
                    container.append(draggable);
                }
            });

        new Sortable(container[0], {
            animation: 150,
            handle: '.timeline-bar',
            onUpdate: () => this.updateTimelineOrder()
        });
    }

    /**
     * Update timeline order and start times based on data-json values
     */
    updateTimelineOrder() {
        const container = document.getElementById('timelineBars');
        const items = Array.from(container.querySelectorAll('.timeline-bar'));
        
        const autoRecalculate = !document.getElementById('autorecalculateCheckbox').checked;
        if(!autoRecalculate) {
            return;
        }
        
        const updatedItems = items.map(item => {
            const itemData = JSON.parse(item.dataset.json);
            return {
                element: item,
                data: {
                    ...itemData,
                    at: Number(itemData.at),
                    options: {
                        ...itemData.options,
                        duration: Number(itemData.options.duration || 0),
                        brightness: Number(itemData.options.brightness || 0),
                        start: Number(itemData.options.start || 0),
                        end: Number(itemData.options.end || 0)
                    }
                },
                duration: Number(itemData.options.duration || 0)
            };
        });

        // Recalculate timeline times with numeric safety
        let currentTime = 0;
        updatedItems.forEach((item) => {
            item.data.at = currentTime;
            currentTime += item.duration;
        });

        // Re-render all items with updated times
        const newHTML = updatedItems.map(({ data }) => 
            Handlebars.partials['timeline-item-template']({
                ...data,
                options: {
                    ...data.options,
                    // Ensure steps are properly formatted
                    leds: data.options.leds || []
                }
            })
        ).join('');

        // Replace container content while maintaining event delegation
        container.innerHTML = newHTML;
    }

    /**
     * Helper to find insertion point
     */
    getDragAfterElement(container, y) {
        return Array.from(container.querySelectorAll('.timeline-bar:not(.dragging)'))
            .reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                return offset < 0 && offset > closest.offset ? 
                    { offset, element: child } : closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /**
     * Delete a timeline item by removing the whole row from the DOM and recalculating
     * @param {Event} e 
     */
    deleteTimelineItem(e) {
        const item = $(e.currentTarget).closest('.timeline-bar');
        item.remove();
        this.updateTimelineOrder();
    }

    /**
     * Add new empty timeline item
     */

    addNewTimelineItem() {
    
        const timelineBars = document.getElementById('timelineBars');
        const newIndex = timelineBars.children.length;
        let startTime = 0;
        let newType = 'FadeIn';

        if(newIndex > 0) {
            const lastItem = JSON.parse(timelineBars.lastElementChild.dataset.json);
            startTime = parseInt(lastItem.at) + parseInt(lastItem.options.duration);
            newType = lastItem.type === 'FadeIn' ? 'FadeOut' : 'FadeIn';
        } 
        let animOptions = {
            duration: newType !== 'Immediate' ? 1000 : 0,
            leds: this.availableSteps,
            start: newType === 'FadeIn' ? 0 : 4095,
            end: newType === 'FadeIn' ? 4095 : 0  
        }    

    
        // Render using precompiled template
        const html = Handlebars.partials['timeline-item-template']({
            index: newIndex,
            at: startTime,
            startTime: startTime,
            type: newType,
            options: animOptions,
            selectedSteps: this.availableSteps.join(','),
        });

        $('#timelineBars').append(html);
        this.updateTimelineOrder();
    }


    /**
     * Handle bulk selection operations in LED selection modal
     * @param {Event} e - Click event from bulk selection button
     * @private
     */
    handleBulkSelection(e) {
        
        const filter = $(e.currentTarget).data('filter');
        const $modal = $('#timelineItemModal');
        const checkboxes = $modal.find('.step-checkboxes input[type=checkbox]');
        
        // Match the PCA9685's bulk selection logic
        switch(filter) {
            case 'all':
                checkboxes.prop('checked', true);
                break;
            case 'none':
                checkboxes.prop('checked', false);
                break;
            case 'odd':
                checkboxes.each(function() {
                    const step = parseInt($(this).val());
                    $(this).prop('checked', step % 2 !== 0);
                });
                break;
            case 'even':
                checkboxes.each(function() {
                    const step = parseInt($(this).val());
                    $(this).prop('checked', step % 2 === 0);
                });
                break;
            case 'invert':
                checkboxes.each(function() {
                    $(this).prop('checked', (i, val) => !val);
                });
                break;
            case 'reverse':
                $('input[name="selectedSteps"]').val($('input[name="selectedSteps"]').val().split(',').reverse().join(','));
                return; // don't overwrite what we just did by rebuilding the input
                break;
        }
        this.handleStepSelectCheckboxChange();
    }


    handleStepSelectCheckboxChange(e) {
        const $modal = $('#timelineItemModal');
        const checkboxes = $modal.find('.step-checkboxes input[type=checkbox]:checked');
        console.log('checkbox change!', checkboxes);
        $modal.find('input[name="selectedSteps"]').val(checkboxes.map((index, el) => el.value).toArray().join(','));
    }

    /**
     * Handle manual input changes in selectedSteps field
     * Updates checkbox states to match comma-separated values
     * @param {Event} e - Input event from selectedSteps field
     * @private
     */
    handleSelectedStepsChange(e) {
        const $modal = $('#timelineItemModal');
        const inputValues = $(e.target).val()
            .split(',')
            .map(v => v.trim())
            .filter(v => v.length > 0);

        // Update checkboxes to match input values
        $modal.find('.step-checkboxes input[type=checkbox]').each(function() {
            const isChecked = inputValues.includes($(this).val().toString());
            $(this).prop('checked', isChecked);
        });
    }

    handleTimelineStepSelection() {
        const $modal = $('#timelineItemModal');
       

    }

    /**
     * Checks timeline for overlaps and updates checkbox state
     * @private
     */
    checkAndHandleOverlaps() {
        const items = Array.from(document.querySelectorAll('.timeline-bar'));
        let hasOverlap = false;
        let previousEnd = 0;

        // Create sorted copy of items based on their start times
        const sortedItems = items.map(item => {
            const json = JSON.parse(item.dataset.json);
            return {
                start: json.at,
                end: json.at + json.options.duration
            };
        }).sort((a, b) => a.start - b.start);

        // Check for overlaps in sorted list
        for (const item of sortedItems) {
            if (item.start < previousEnd) {
                hasOverlap = true;
                break;
            }
            previousEnd = item.end;
        }

        // Update checkbox state based on overlap detection
        const checkbox = document.getElementById('autorecalculateCheckbox');
        if (checkbox) {
            checkbox.checked = hasOverlap;
        }
    }
}