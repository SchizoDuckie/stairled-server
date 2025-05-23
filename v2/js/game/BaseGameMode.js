import eventBus from '../core/event-bus.js';
import Events from '../core/event-constants.js';

import QuizEngine from '../services/QuizEngine.js';

// --- Constants for scoring (moved from SinglePlayerGame) ---
const BASE_SCORE = 10;
const MAX_TIME_BONUS = 50;

/**
 * Provides the base structure and common logic for different game modes.
 * Handles interaction with QuizEngine, basic game flow (start, next question, finish),
 * and common event emissions.
 * 
 * **Important:** This base class assumes subclasses (like SinglePlayerGame or MultiplayerGame)
 * will:
 * 1. Instantiate a `this.timer` object (e.g., using `core/timer.js`) in their constructor,
 *    setting its `initialDurationMs` based on game settings (like difficulty).
 * 2. Implement the necessary hooks (_beforeNextQuestion, _afterQuestionPresented, etc.)
 *    to correctly start, stop, and reset `this.timer` during the game flow.
 * 
 * The `_calculateScore` method relies on `this.timer.initialDurationMs` and
 * `this.timer.getElapsedTime()` to calculate time-based bonuses, indirectly
 * incorporating difficulty through the timer's configuration set by the subclass.
 */
class BaseGameMode {
    /**
     * @param {string} modeIdentifier - A string identifying the mode (e.g., 'practice', 'single', 'multiplayer').
     * @param {object} settings - Game settings specific to the mode.
     * @param {string} [playerName] - Optional player name.
     */
    constructor(modeIdentifier, settings, playerName = 'Player') {
        console.log(`[BaseGameMode:${modeIdentifier}] Initializing with settings:`, settings, `Player: ${playerName}`);
        this.mode = modeIdentifier;
        this.settings = settings;
        this.playerName = playerName; // Store player name, useful for results
        this.quizEngine = QuizEngine;
        this.isFinished = false;
        this.lastAnswerCorrect = null; // Used for delaying next question after feedback
        this._boundHandleAnswerSubmitted = null; // Store bound listener
        this.currentQuestionIndex = -1; // Initialize index tracking

        this._registerBaseListeners();
    }

    /**
     * Registers listeners common to all game modes.
     * Subclasses should call super._registerBaseListeners() if they override this,
     * or provide their own specific listener registration.
     * @protected
     */
    _registerBaseListeners() {
        // Listen for answer submission from UI
        this._boundHandleAnswerSubmitted = this._handleAnswerSubmitted.bind(this);
        eventBus.on(Events.UI.GameArea.AnswerSubmitted, this._boundHandleAnswerSubmitted);
        console.log(`[BaseGameMode:${this.mode}] Registered base listeners.`);
    }

    /**
     * Starts the game by loading questions and presenting the first one.
     * Emits Game.Started on success or System.ErrorOccurred on failure.
     */
    async start() {
        console.log(`[BaseGameMode:${this.mode}] Starting game...`);
        try {
            await this.quizEngine.loadQuestions(this.settings.sheetIds, this.settings.difficulty);
            if (this.quizEngine.getQuestionCount() === 0) {
                throw new Error("No questions loaded for the selected sheets/difficulty.");
            }
            this.isFinished = false;
            this.lastAnswerCorrect = null;
            // Emit game started event
            eventBus.emit(Events.Game.Started, { mode: this.mode, settings: this.settings, role: 'player' });
            // Load the first question
            this.nextQuestion();
        } catch (error) {
            console.error(`[BaseGameMode:${this.mode}] Error starting game:`, error);
            eventBus.emit(Events.System.ErrorOccurred, {
                message: `Error starting ${this.mode} game: ${error.message}`,
                error,
                context: `${this.mode}-game-start`
            });
            this.finishGame(); // Ensure game ends if start fails
        }
    }

    /**
     * Handles moving to the next question or finishing the game.
     * Emits Game.QuestionNew or triggers finishGame.
     */
    nextQuestion() {
        if (this.isFinished) return;

        this._beforeNextQuestion(); // Hook for subclasses (e.g., stop timer)

        this.lastAnswerCorrect = null; // Reset correctness indicator for UI
        // Calculate based on internal state
        const nextIndex = this.currentQuestionIndex + 1;

        if (this.quizEngine.isQuizComplete(nextIndex)) {
            this.finishGame();
        } else {
            // Use the correct method: getQuestionData
            const questionData = this.quizEngine.getQuestionData(nextIndex);
            if (questionData) {
                // UPDATE internal index after successfully getting data
                this.currentQuestionIndex = nextIndex;
                const totalQuestions = this.quizEngine.getQuestionCount();
                // Use internal index for logging
                console.log(`[BaseGameMode:${this.mode}] Presenting question ${this.currentQuestionIndex + 1}/${totalQuestions}`);
                eventBus.emit(Events.Game.QuestionNew, {
                    // Use internal index for event
                    questionIndex: this.currentQuestionIndex,
                    totalQuestions: totalQuestions,
                    questionData: {
                        question: questionData.question,
                        // Use internal index for getting answers
                        answers: this.quizEngine.getShuffledAnswers(this.currentQuestionIndex)
                    }
                });
                this._afterQuestionPresented(); // Hook for subclasses (e.g., start timer)
            } else {
                console.error(`[BaseGameMode:${this.mode}] Could not retrieve question data for index ${nextIndex}`);
                this.finishGame();
            }
        }
    }

    /**
     * Handles the player submitting an answer. Checks the answer using QuizEngine,
     * emits Game.AnswerChecked, and triggers the next question sequence.
     * Subclasses can override _calculateScore and _afterAnswerChecked.
     * @param {object} payload
     * @param {any} payload.answer - The submitted answer.
     * @protected
     */
    _handleAnswerSubmitted({ answer }) {
        if (this.isFinished || this.lastAnswerCorrect !== null) {
            console.log(`[BaseGameMode:${this.mode}] Ignoring answer submission (finished or already answered).`);
            return; // Ignore if game is over or already processed
        }
        // Use the internally tracked index
        const currentIndex = this.currentQuestionIndex;
        if (currentIndex < 0) return; // Ignore if no question active

        console.log(`[BaseGameMode:${this.mode}] Answer submitted for question ${currentIndex + 1}:`, answer);
        this._beforeAnswerCheck(); // Hook for subclasses (e.g., stop timer)

        const checkResult = this.quizEngine.checkAnswer(currentIndex, answer);
        this.lastAnswerCorrect = checkResult.isCorrect;
        const scoreDelta = this._calculateScore(checkResult.isCorrect);

        eventBus.emit(Events.Game.AnswerChecked, {
            isCorrect: checkResult.isCorrect,
            scoreDelta: scoreDelta,
            correctAnswer: checkResult.correctAnswer,
            submittedAnswer: answer
        });

        this._afterAnswerChecked(checkResult.isCorrect, scoreDelta); // Hook for subclasses (e.g., update total score)

        // Delay moving to the next question to allow feedback display
        setTimeout(() => {
            if (!this.isFinished && this.lastAnswerCorrect !== null) { // Check ensures we don't proceed if finished during delay
                 this.nextQuestion();
            }
        }, 1500); // Standard delay
    }

    /**
     * Finishes the game, calculates results, emits Game.Finished, and cleans up listeners.
     */
    finishGame() {
        if (this.isFinished) return;
        console.log(`[BaseGameMode:${this.mode}] Finishing game...`);
        this.isFinished = true;
        this._beforeFinish(); // Hook for subclasses (e.g., stop timer)

        const baseResults = {
            playerName: this.playerName,
            totalQuestions: this.quizEngine.getQuestionCount(),
            correctAnswers: this.quizEngine.getCorrectCount(),
            settings: this.settings
        };

        const finalResults = this._getFinalResults(baseResults);

        console.log(`[BaseGameMode:${this.mode}] Final Results:`, finalResults);
        eventBus.emit(Events.Game.Finished, { mode: this.mode, results: finalResults });

        this._cleanupListeners();
    }

    /**
     * Cleans up event listeners registered by this base class.
     * Subclasses overriding this should call super._cleanupListeners().
     * @protected
     */
    _cleanupListeners() {
        if (this._boundHandleAnswerSubmitted) {
            eventBus.off(Events.UI.GameArea.AnswerSubmitted, this._boundHandleAnswerSubmitted);
            this._boundHandleAnswerSubmitted = null;
            console.log(`[BaseGameMode:${this.mode}] Cleaned up AnswerSubmitted listener.`);
        } else {
             console.log(`[BaseGameMode:${this.mode}] No stored AnswerSubmitted listener reference to clean up.`);
        }
        // Subclasses should remove their specific listeners here or in their own cleanup
    }

    /**
     * Destroys the game mode instance, ensuring cleanup.
     */
    destroy() {
        console.log(`[BaseGameMode:${this.mode}] Destroying instance.`);
        this.finishGame(); // Ensure game is marked finished and listeners cleaned
        this.quizEngine = null; // Release reference
        // Any other subclass-specific cleanup should happen before/after super.destroy()
    }

    // --- Hooks for Subclasses --- 

    /** Hook called before checking the next question index. (e.g., stop timer) @protected */
    _beforeNextQuestion() { }

    /** Hook called after a new question is presented. (e.g., start timer) @protected */
    _afterQuestionPresented() { }

    /** Hook called before the submitted answer is checked. (e.g., stop timer) @protected */
    _beforeAnswerCheck() { }

    /**
     * Hook to calculate score delta for an answer. Base implementation provides time bonus.
     *
     * **How Scoring Works:**
     * - **Base Score:** You get 10 points for a correct answer.
     * - **Time Bonus:** You get up to 50 *extra* points based on how fast you answer.
     * - **Difficulty:** Difficulty (set by the specific game mode like SinglePlayerGame)
     *   determines the total time allowed per question (via `this.timer.initialDurationMs`).
     *   Answering quickly on a *harder* difficulty (less total time) gives a proportionally
     *   *larger* time bonus than answering in the same absolute time on an easier difficulty.
     *   The bonus is calculated based on the percentage of the allowed time remaining.
     *
     * @param {boolean} isCorrect - Whether the answer was correct.
     * @param {number} [elapsedMs] - Optional: The elapsed time in MS for score calculation (used by MP Host).
     *                              If not provided, the method attempts to use `this.timer.getElapsedTime()`.
     * @returns {number} The score change (BASE_SCORE + time bonus for correct, 0 otherwise).
     * @protected
     */
    _calculateScore(isCorrect, elapsedMs = null) {
        if (!isCorrect) {
            return 0;
        }

        // Determine elapsed time: Use provided value or get from local timer
        let timeToUseMs = elapsedMs;
        if (timeToUseMs === null && this.timer && typeof this.timer.getElapsedTime === 'function') {
            timeToUseMs = this.timer.getElapsedTime();
        } else if (timeToUseMs === null) {
            // No elapsed time provided and no local timer/method found
            console.log(`[BaseGameMode:${this.mode}] Score Calc: Correct! No timer/elapsed time found. Awarding base score.`);
            return BASE_SCORE;
        }

        // Check if a timer duration exists
        if (this.timer && this.timer.initialDurationMs > 0) {
            const durationMs = this.timer.initialDurationMs;

            if (durationMs > 0 && timeToUseMs >= 0) { // elapsed can be 0
                 const elapsedSec = timeToUseMs / 1000;
                 const durationSec = durationMs / 1000;
                 const timeFactor = Math.max(0, 1 - (elapsedSec / durationSec));
                 const timeBonus = Math.round(MAX_TIME_BONUS * timeFactor);
                 const totalScoreDelta = BASE_SCORE + timeBonus;
                 console.log(`[BaseGameMode:${this.mode}] Score Calc: Correct! elapsed=${elapsedSec.toFixed(2)}s, duration=${durationSec}s, factor=${timeFactor.toFixed(2)}, bonus=${timeBonus}, totalDelta=${totalScoreDelta}`);
                 return totalScoreDelta;
            } else {
                 console.warn(`[BaseGameMode:${this.mode}] Score Calc: Correct, but durationMs (${durationMs}) or elapsedMs (${timeToUseMs}) invalid. Awarding base score.`);
                 return BASE_SCORE;
            }
        } else {
            // No timer duration found, award base score only
            console.log(`[BaseGameMode:${this.mode}] Score Calc: Correct! No timer duration found. Awarding base score.`);
            return BASE_SCORE;
        }
    }

    /**
     * Hook called after an answer has been checked and Game.AnswerChecked emitted.
     * @param {boolean} isCorrect - Whether the answer was correct.
     * @param {number} scoreDelta - The score change calculated by _calculateScore.
     * @protected
     */
    _afterAnswerChecked(isCorrect, scoreDelta) { 
        // Example: Subclass could update total score and emit ScoreUpdated here
    }

    /** Hook called before the Game.Finished event is emitted. (e.g., stop timers) @protected */
    _beforeFinish() { }

    /**
     * Hook to allow subclasses to add mode-specific data to the final results object.
     * @param {object} baseResults - Results object containing common data.
     * @returns {object} The final results object.
     * @protected
     */
    _getFinalResults(baseResults) {
        return baseResults; // Base implementation returns results as is
    }
}

export default BaseGameMode; 