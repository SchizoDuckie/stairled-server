/**
 * Controls user notification system including:
 * - Temporary alert messages
 * - Result modal displays
 * - Template management for notifications
 */
class AlertController {
    static instance; // Private static field
    
    static getInstance() {
        if (!this.instance) {
            this.instance = new AlertController();
        }
        return this.instance;
    }

    /**
     * Initializes modal reference and templates
     */
    constructor() {
        if (AlertController.instance) {
            return AlertController.instance;
        }
        // Verify modal element exists first
        if (document.getElementById('resultModal')) {
            this.resultModal = new bootstrap.Modal('#resultModal');
        }
        this.compileTemplates();
        AlertController.instance = this;
    }

    /**
     * Displays temporary alert message
     * @param {string} type - Alert type: 'success', 'danger', 'warning', 'info'
     * @param {string} message - Content to display (supports HTML)
     */
    showAlert(type, message) {
        const alertDiv = $(this.alertTemplate({ type, message }));
        $('#alerts-container').append(alertDiv);
        setTimeout(() => alertDiv.alert('close'), 5000);
    }

    /**
     * Displays result modal with status styling
     * @param {boolean} success - Operation outcome
     * @param {string} title - Modal header text
     * @param {string} message - Detailed status message
     */
    showResultModal(success, title, message) {
        const modal = $('#resultModal');
        modal.find('.modal-title').text(title);
        modal.find('.modal-body').html(message);
        modal.find('.modal-header')
            .removeClass('bg-danger bg-success')
            .addClass(success ? 'bg-success' : 'bg-danger');
        this.resultModal.show();
    }

    compileTemplates() {
        const alertTemplate = document.getElementById('alert-partial').innerHTML;
        this.alertTemplate = Handlebars.compile(alertTemplate);
    }
} 