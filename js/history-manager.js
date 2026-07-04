/**
 * KrakenScape History Manager
 * Handles undo/redo functionality for soundscape changes
 */

class HistoryManager {
    constructor(app, maxHistory = 50) {
        this.app = app;
        this.maxHistory = maxHistory;
        this.undoStack = [];
        this.redoStack = [];
        this.isUndoing = false;
        this.isRedoing = false;
    }

    /**
     * Save current state to history
     * @param {string} action - Description of the action
     */
    saveState(action) {
        // Don't save during undo/redo operations
        if (this.isUndoing || this.isRedoing) return;

        const state = this._captureState();
        if (!state) return;

        this.undoStack.push({
            action: action,
            state: state,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Clear redo stack when new action is performed
        this.redoStack = [];

        // Update UI
        this._updateUI();
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return false;

        this.isUndoing = true;

        // Save current state to redo stack
        const currentState = this._captureState();
        const lastAction = this.undoStack.pop();

        this.redoStack.push({
            action: lastAction.action,
            state: currentState,
            timestamp: Date.now()
        });

        // Restore previous state
        this._restoreState(lastAction.state);

        this.isUndoing = false;
        this._updateUI();

        console.log(`Undo: ${lastAction.action}`);
        return true;
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return false;

        this.isRedoing = true;

        // Save current state to undo stack
        const currentState = this._captureState();
        const redoAction = this.redoStack.pop();

        this.undoStack.push({
            action: redoAction.action,
            state: currentState,
            timestamp: Date.now()
        });

        // Restore redo state
        this._restoreState(redoAction.state);

        this.isRedoing = false;
        this._updateUI();

        console.log(`Redo: ${redoAction.action}`);
        return true;
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._updateUI();
    }

    /**
     * Capture current application state
     */
    _captureState() {
        if (!this.app.currentSoundscape) return null;

        return {
            soundscapeId: this.app.currentSoundscape.id,
            layers: JSON.parse(JSON.stringify(this.app.currentSoundscape.layers)),
            oneShots: JSON.parse(JSON.stringify(this.app.currentSoundscape.oneShots)),
            moods: JSON.parse(JSON.stringify(this.app.currentSoundscape.moods))
        };
    }

    /**
     * Restore application state
     */
    _restoreState(state) {
        if (!state || !this.app.currentSoundscape) return;
        if (state.soundscapeId !== this.app.currentSoundscape.id) return;

        // Restore layers
        this.app.currentSoundscape.layers = state.layers;

        // Restore one-shots
        this.app.currentSoundscape.oneShots = state.oneShots;

        // Restore moods
        this.app.currentSoundscape.moods = state.moods;

        // Rebuild configs from restored data
        this.app.layerConfigs.clear();
        state.layers.forEach(layer => {
            this.app.layerConfigs.set(layer.id, layer);
        });

        this.app.oneShotConfigs.clear();
        state.oneShots.forEach(oneShot => {
            this.app.oneShotConfigs.set(oneShot.id, oneShot);
        });

        // Save and re-render
        this.app._saveToStorage();
        this.app._renderAll();
    }

    /**
     * Update UI elements (enable/disable undo/redo buttons)
     */
    _updateUI() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.title = this.canUndo()
                ? `Undo: ${this.undoStack[this.undoStack.length - 1]?.action || ''} (Ctrl+Z)`
                : 'Nothing to undo';
        }

        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.title = this.canRedo()
                ? `Redo: ${this.redoStack[this.redoStack.length - 1]?.action || ''} (Ctrl+Y)`
                : 'Nothing to redo';
        }
    }
}

// Export for use in other modules
window.HistoryManager = HistoryManager;
