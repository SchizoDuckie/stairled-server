/**
 * Controls a single PCA9685 LED driver interface
 */
class DriverController {
    /**
     * @param {HTMLElement} driverElement - The root element for this driver's UI
     * @param {WebSocket} socket - WebSocket connection for sending PWM commands
     */
    constructor(driverElement, socket) {
        this.element = $(driverElement);
        this.driverId = this.element.data('driver');
        this.linkSliders = this.element.find('.linksliders');
        this.socket = socket;
        
        this.rows = this.element.find('tbody tr').map((_, row) => ({
            element: $(row),
            checkbox: $(row).find('input[type=checkbox]').first(),
            slider: $(row).find('input[type=range]'),
            testButton: $(row).find('button[data-identify]'),
            input: $(row).find('input[type=number]')
        })).get();
        
        this.lastUpdate = 0;
        this.THROTTLE_MS = 12;
        
        this.isDragging = false;
        this.dragStartRow = null;
        
        this.initializeEvents();
    }

    initializeEvents() {
        this.element.on('input', 'input[type=range]', (e) => this.handleBrightnessChange(e));
        this.element.on('click', 'button[data-identify]', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleTestLight(e);
        });
        this.element.on('change', '.enable-all', (e) => this.handleEnableAll(e));
        this.element.on('change', 'tbody tr input[type=checkbox]', (e) => this.handleCheckboxChange(e));

        // Add click handler for rows
        this.element.on('click', 'tbody tr', (e) => {
            // Ignore if clicked on checkbox, button, or slider
            if ($(e.target).is('input, button') || $(e.target).closest('button').length) {
                return;
            }
            
            const row = this.rows.find(r => r.element[0] === e.currentTarget);
            if (row && !row.checkbox.is(':checked')) {
                row.checkbox.prop('checked', true).trigger('change');
            }
        });

        // Add drag handlers
        this.element.on('mousedown', 'tbody tr', (e) => {
            // Ignore if clicked on checkbox, button, or slider
            if ($(e.target).is('input, button') || $(e.target).closest('button').length) {
                return;
            }
            
            this.isDragging = true;
            this.dragStartRow = $(e.currentTarget);
        });

        $(document).on('mousemove', (e) => {
            if (!this.isDragging) return;

            // Find row under cursor
            const row = $(document.elementFromPoint(e.clientX, e.clientY)).closest('tr');
            if (row.length && row.closest('.pca9685')[0] === this.element[0]) {
                const rowData = this.rows.find(r => r.element[0] === row[0]);
                if (rowData && !rowData.checkbox.is(':checked')) {
                    rowData.checkbox.prop('checked', true).trigger('change');
                }
            }
        });

        $(document).on('mouseup', () => {
            this.isDragging = false;
            this.dragStartRow = null;
        });
    }

    isLinked() {
        return this.linkSliders.is(':checked');
    }

    getEnabledRows() {
        return this.rows.filter(row => row.checkbox.is(':checked'));
    }

    getEnabledPorts() {
        return this.getEnabledRows().map(row => row.slider.data('port'));
    }

    setBrightness(brightness) {
        // Don't filter by checkbox state for brightness control
        const ports = this.getSelectedPorts();
        if (ports.length) {
            this.getSelectedSliders().forEach(slider => slider.val(brightness));
            this.socket.send(`setPWM|${this.driverId}|${ports.join(',')}|${brightness}`);
        }
    }

    // For PWM/testing - don't check checkbox state
    getSelectedPorts() {
        return this.rows
            .filter(row => this.isLinked() || row.slider.data('selected'))
            .map(row => row.slider.data('port'));
    }

    getSelectedSliders() {
        return this.rows
            .filter(row => this.isLinked() || row.slider.data('selected'))
            .map(row => row.slider);
    }

    handleBrightnessChange(event) {
        const now = Date.now();
        if (now - this.lastUpdate < this.THROTTLE_MS) {
            setTimeout(() => {
                this.handleBrightnessChange.call(this, event);
            }, this.THROTTLE_MS - (now - this.lastUpdate));
            return;
        }
        this.lastUpdate = now;

        const brightness = parseInt($(event.target).val());
        
        if (this.isLinked()) {
            this.manager.updateLinkedBrightness(brightness, this);
        } else {
            // Handle single slider change
            const port = $(event.target).data('port');
            this.socket.send(`setPWM|${this.driverId}|${port}|${brightness}`);
        }
    }

    handleTestLight(event) {
        const clickedRow = this.rows.find(row => 
            row.testButton[0] === event.target || row.testButton.find(event.target).length
        );
        
        if (!clickedRow) return;

        // Only check enabled status if we're in linked mode
        if (this.isLinked() && !clickedRow.checkbox.is(':checked')) return;

        const range = clickedRow.slider;
        clearInterval(range.data('interval'));
        
        let goingUp = true;
        const interval = setInterval(() => {
            const val = parseInt(range.val());
            if (goingUp) {
                if (val < 4095) {
                    const newVal = val + 100;
                    if (this.isLinked()) {
                        this.manager.updateLinkedBrightness(newVal, this);
                    } else {
                        range.val(newVal).trigger('input');
                    }
                } else {
                    goingUp = false;
                }
            } else {
                if (val > 0) {
                    const newVal = val - 50;
                    if (this.isLinked()) {
                        this.manager.updateLinkedBrightness(newVal, this);
                    } else {
                        range.val(newVal).trigger('input');
                    }
                } else {
                    clearInterval(interval);
                }
            }
        }, this.THROTTLE_MS);
        
        range.data('interval', interval);
    }

    handleEnableAll(event) {
        const checked = event.target.checked;
        this.rows.forEach(row => {
            if (row.checkbox.is(':checked') !== checked) {
                row.checkbox.prop('checked', checked).trigger('change');
            }
        });
    }

    handleCheckboxChange(event) {
        const row = this.rows.find(r => r.checkbox[0] === event.target);
        if (!row) return;

        const active = event.target.checked;
        
        row.element.toggleClass('table-active', active);
        
        if (active) {
            const nextStep = this.manager.getNextStepNumber();
            row.input
                .val(nextStep)
                .removeClass('border-dark')
                .addClass('border-primary')
                .prop('disabled', false)
                .attr('data-pin', row.slider.data('port'))
                .attr('data-driver', this.driverId);
        } else {
            row.input
                .val('')
                .removeClass('border-primary')
                .addClass('border-dark')
                .prop('disabled', true)
                .removeAttr('data-pin')
                .removeAttr('data-driver');
        }
    }

    setManager(manager) {
        this.manager = manager;
    }
}


