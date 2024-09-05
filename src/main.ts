/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    Subject,
    Subscription,
    from,
    fromEvent,
    interval,
    merge,
    of,
    timer,
} from "rxjs";
import {
    map,
    filter,
    scan,
    take,
    mergeMap,
    startWith,
    switchMap,
} from "rxjs/operators";
import * as Tone from "tone";
import { SampleLibrary } from "./tonejs-instruments";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 200,
    CANVAS_HEIGHT: 400,
} as const;

const Constants = {
    TICK_RATE_MS: 7,
    SONG_NAME: "RockinRobin",
    COLUMN_BASE: 350,
} as const;

const NotePreset = {
    RADIUS: 0.07 * Viewport.CANVAS_WIDTH,
    TAIL_WIDTH: 10,
};

type Note = {
    id: string;
    user_played: string;
    instrument_name: string;
    velocity: number;
    pitch: number;
    start: number;
    end: number;
    yPos: number;
    tail: null | Tail;
    noteDuration: number;
    heldDuration: number;
};

type Tail = {
    y1Pos: number;
    tailLength: number;
};

const columns = [
    {
        key: "KeyH",
        position: "20%",
        color: "fill: url(#greenGradient)",
        tailColor: "#7FFF00",
    },
    {
        key: "KeyJ",
        position: "40%",
        color: "fill: url(#redGradient)",
        tailColor: "#DC143C",
    },
    {
        key: "KeyK",
        position: "60%",
        color: "fill: url(#blueGradient)",
        tailColor: "#007FFF",
    },
    {
        key: "KeyL",
        position: "80%",
        color: "fill: url(#yellowGradient)",
        tailColor: "#FFD700",
    },
];

/** User input */

type Key = "KeyH" | "KeyJ" | "KeyK" | "KeyL";

type Event = "keydown" | "keyup" | "keypress";

/** Utility functions */
/* Retrieved from FIT2102 workshop4Solutions */
const /**
     * Composable not: invert boolean result of given function
     * @param f a function returning boolean
     * @param x the value that will be tested with f
     */
    not =
        <T>(f: (x: T) => boolean) =>
        (x: T) =>
            !f(x),
    /**
     * is e an element of a using the eq function to test equality?
     * @param eq equality test function for two Ts
     * @param a an array that will be searched
     * @param e an element to search a for
     */
    elem =
        <T>(eq: (_: T) => (_: T) => boolean) =>
        (a: ReadonlyArray<T>) =>
        (e: T) =>
            a.findIndex(eq(e)) >= 0,
    /**
     * set a number of attributes on an Element at once
     * @param e the Element
     * @param o a property bag
     */
    attr = (e: Element, o: { [p: string]: unknown }) => {
        for (const k in o) e.setAttribute(k, String(o[k]));
    };
/**
 * Retrieved from FIT2102 workshop4Solutions
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends object>(
    input: null | undefined | T,
): input is T {
    return input != null;
}

/**
 * Utility function to generate a random note.
 *
 * @param seed A seed value to generate random notes
 */
const createRandomNote = (seed: number) => {
    // List of available instruments
    const instruments = ["bass-electric", "violin", "piano"];

    seed = RNG.hash(seed);
    const instrumentIndex =
        Math.abs(Math.floor(RNG.scale(seed) * instruments.length)) %
        instruments.length;
    const randomInstrument = instruments[instrumentIndex];

    const randomVelocity = (RNG.scale(seed) + 1) / 2;

    const randomPitch =
        Math.floor(((RNG.scale(seed) + 1) / 2) * (108 - 21 + 1)) + 21;

    const randomDuration = ((RNG.scale(seed) + 1) / 2) * 0.5;

    // Create a note from random values
    return {
        id: "",
        user_played: "False",
        instrument_name: randomInstrument,
        velocity: randomVelocity,
        pitch: randomPitch,
        start: 0,
        end: randomDuration,
        yPos: 0,
        tail: null,
        heldDuration: 0,
        noteDuration: randomDuration,
    };
};

/**
 * Retrieved from FIT2102 applied3
 * A random number generator which provides two pure functions
 * `hash` and `scaleToRange`.  Call `hash` repeatedly to generate the
 * sequence of hashes.
 */
abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;

    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;

    /**
     * Takes hash value and scales it to the range [-1, 1]
     */
    public static scale = (hash: number) => (2 * hash) / (RNG.m - 1) - 1;
}

/**
 * Parses the CSV contents into an array of Note objects.
 *
 * @param csv_contents CSV contents as a string
 * @returns Array of Note objects
 */
function parseCSV(csv_contents: string): Note[] {
    return csv_contents.split("\n").map((line) => {
        const [user_played, instrument_name, velocity, pitch, start, end] =
            line.split(",");

        return {
            id: "",
            user_played,
            instrument_name,
            velocity: parseFloat(velocity) / 127, // Convert velocity to [0,1]
            pitch: parseFloat(pitch),
            start: parseFloat(start),
            end: parseFloat(end),
            yPos: 0,
            y1Pos: 0,
            tail: null,
            heldDuration: 0,
            noteDuration: Math.round(
                ((parseFloat(end) - parseFloat(start)) * 1000) /
                    Constants.TICK_RATE_MS,
            ),
        };
    });
}

/**
 * Helper method to get the column index based on the pitch of the note.
 * Used to distribute notes across the columns.
 */
const getColumnIndex = (pitch: number): number => {
    // Map the pitch to a specific column
    return pitch % columns.length;
};

/** State processing */

type State = Readonly<{
    time: number;
    score: number;
    scoreMultiplier: number;
    notes: ReadonlyArray<Note>;
    expiredNotes: ReadonlyArray<Note>;
    expiredTailNotes: ReadonlyArray<Note>;
    noteCount: number;
    expiredNotesCount: number;
    gameEnd: boolean;
    totalNotes: ReadonlyArray<Note>;
    notesQueue: ReadonlyArray<Note>;
    combo: number;
    highscore: number;
    allUserPlayedNotesId: ReadonlyArray<String>;
    tailNotes: ReadonlyArray<Note>;
    tailNotesQueue: ReadonlyArray<Note>;
}>;

const initialState: State = {
    time: 0,
    score: 0,
    scoreMultiplier: 1,
    notes: [], // Used to render all notes
    expiredNotes: [],
    expiredTailNotes: [],
    noteCount: 0,
    expiredNotesCount: 0,
    gameEnd: false,
    totalNotes: [],
    notesQueue: [], // Used to play notes that are corerctly tapped by user
    combo: 0,
    highscore: 0,
    allUserPlayedNotesId: [],
    tailNotes: [], // Kee[ track of all notes with tail
    tailNotesQueue: [], // Tail notes that are played
} as const;

/** Actions */
interface Action {
    apply(s: State): State;
}

/**
 * Updates the state by applying the action through calling the apply method.
 */
const updateState = (s: State, action: Action) => {
    return action.apply(s);
};

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
class Tick implements Action {
    constructor(public readonly elapsed: number) {}

    // Process all tick based updates here
    apply(s: State): State {
        // Handles note activity (active/expired)
        const expired = (note: Note) => note.yPos >= Constants.COLUMN_BASE,
            bgNotes = (note: Note) => note.user_played == "False",
            playable = (note: Note) => note.yPos == Constants.COLUMN_BASE, // Notes are only playable when they reach the base
            isTailNoteInQueue = (note: Note) => s.tailNotesQueue.includes(note),
            tailNoteDurationExpired = (note: Note) =>
                isNotNullOrUndefined(note.tail) &&
                note.heldDuration > note.noteDuration,
            isRepeatedNote = (note: Note) =>
                s.allUserPlayedNotesId.includes(note.id);

        // Handles regular notes
        const expiredNotes: Note[] = s.notes.filter(expired),
            activeNotes = s.notes.filter(not(expired)),
            activebgNotesFilter = s.notes.filter(bgNotes),
            activePlayableNotes = activebgNotesFilter.filter(playable); // All background notes are playable when they reach the base

        // Handles tail notes
        const expiredTailNotes = s.tailNotes.filter(
                (note) => expired(note) && !isTailNoteInQueue(note),
            ),
            activeTailNotes = s.tailNotes.filter(
                (note) => !expired(note) || isTailNoteInQueue(note),
            ),
            activeTailNotesHold = s.tailNotesQueue.filter(
                (note) => !expired(note) && !tailNoteDurationExpired(note),
            ),
            expiredDurationTailNotes = s.tailNotesQueue.filter(
                tailNoteDurationExpired,
            );

        // Updating expired notes to include all note types
        const allExpiredNotes = expiredNotes
                .concat(expiredTailNotes)
                .concat(expiredDurationTailNotes),
            accExpiredNotesCount = s.expiredNotesCount + allExpiredNotes.length;

        const gameEnd =
            s.totalNotes.length - 2 <= accExpiredNotesCount &&
            s.notesQueue.concat(s.tailNotesQueue).length === 0; // -2 to account for header and end empty line

        // User notes that would expire this tick and not already expired
        const missedUserNotes = allExpiredNotes.filter(
            (note) => note.user_played === "True" && !isRepeatedNote(note),
        );

        // Combo and multiplier resets when the user misses a note that is user_played == True
        const handleCombo = missedUserNotes.length > 0 ? 0 : s.combo,
            handleMultiplier =
                missedUserNotes.length > 0 ? 1 : s.scoreMultiplier;

        // Allows notes to only be played once
        const uniqueActivePlayableNotes = activePlayableNotes.filter(
            (note) => !isRepeatedNote(note),
        );

        return {
            ...s,
            time: this.elapsed,
            notes: activeNotes.map(Tick.animateNote),
            expiredNotes: allExpiredNotes, // All expired notes
            notesQueue: uniqueActivePlayableNotes, // All notes that are playable
            gameEnd: gameEnd ? true : false,
            highscore: s.score > s.highscore ? s.score : s.highscore,
            combo: handleCombo,
            scoreMultiplier: handleMultiplier,
            tailNotes: activeTailNotes.map((note) =>
                Tick.animateTailNote(note),
            ),
            tailNotesQueue: activeTailNotesHold.map(Tick.handleTailNoteHold),
            expiredNotesCount: accExpiredNotesCount,
            expiredTailNotes: expiredDurationTailNotes,
        };
    }
    // Regular note animation
    static animateNote = (note: Note) => ({
        ...note,
        yPos: note.yPos + 1,
    });
    // Tailnotes falling animation
    static animateTailNote = (note: Note) => {
        if (!isNotNullOrUndefined(note.tail)) {
            return note;
        }
        // taillength starts shrinking when it can fully fit on the column
        const calculatedY1Pos =
            note.tail.tailLength < note.noteDuration ? 0 : 1;

        return {
            ...note,
            tail: {
                ...note.tail,
                y1Pos: note.tail.y1Pos + calculatedY1Pos,
                tailLength: note.tail.tailLength + 1,
            },
            yPos: note.yPos + 1,
        };
    };
    // Tail note is held only when it is in a queue
    static handleTailNoteHold = (note: Note) => {
        if (!isNotNullOrUndefined(note.tail)) {
            return note;
        }
        // taillength starts shrinking when it can fully fit on the column
        const calculatedY1Pos =
            note.tail.tailLength < note.noteDuration ? 0 : 1;
        return {
            ...note,
            tail: {
                ...note.tail,
                y1Pos: note.tail.y1Pos + calculatedY1Pos,
                tailLength: note.tail.tailLength + 1,
            },
            heldDuration: note.heldDuration + 1,
        };
    };
}
/**
 * A class that adds notes from the parsed csv file to the state.
 * Called when the note is emitted by repspective observable.
 */
class AddNote implements Action {
    constructor(public note: Note) {
        this.note = note;
    }

    apply(s: State): State {
        const isTailNote = (note: Note) =>
            note.end - note.start > 1 && note.user_played === "True";
        const note = {
            ...this.note,
            id: s.noteCount.toString(), // Set the ID as current noteCount
        };
        if (isTailNote(note)) {
            const tailnote = {
                ...note,
                tail: {
                    tailLength: 0,
                    y1Pos: 0,
                },
                heldDuration: 0,
            };
            return {
                ...s,
                tailNotes: s.tailNotes.concat(tailnote),
                noteCount: s.noteCount + 1,
            };
        }

        return {
            ...s,
            notes: s.notes.concat(note),
            noteCount: s.noteCount + 1,
            notesQueue: [],
            expiredNotes: [],
        };
    }
}

/**
 * A class that handles the user input when a key is pressed.
 */
class Tap implements Action {
    constructor(
        public keyCode: string,
        public keyAction: Event,
    ) {
        this.keyCode = keyCode;
        this.keyAction = keyAction;
    }

    apply(s: State): State {
        const columnIndex = columns.findIndex(
                (col) => col.key === this.keyCode,
            ),
            minAccepted = Constants.COLUMN_BASE * 0.93, // Allows for 7% marginal error
            isTailNote = (note: Note) => note.end - note.start > 1;

        // Condition to verify a note validity
        const isValidNote = (note: Note) =>
            getColumnIndex(note.pitch) === columnIndex &&
            note.yPos > minAccepted &&
            note.user_played === "True";

        // Detect notes that are tapped correctly
        const validUserInputNotes = s.notes.filter(
            (note) => isValidNote(note) && !s.notesQueue.includes(note),
        );

        // Detect tailnotes that are tapped correctly
        const validTailNotes = s.tailNotes.filter(isValidNote);
        const validTailNotesInQueue = s.tailNotesQueue.filter(isValidNote);

        if (this.keyAction === "keydown") {
            // There is a tailnote in the current column,
            // Just tapped OR currently held down
            if (validTailNotes.length > 0 || validTailNotesInQueue.length > 0) {
                return Tap.handleTailNoteHold(s, validTailNotes);
            }

            return Tap.handleNormalNote(
                s,
                validUserInputNotes.filter(not(isTailNote)),
            );
        } else if (this.keyAction === "keyup") {
            return Tap.handleTailNoteRelease(s, columnIndex);
        }

        return s;
    }
    static handleTailNoteHold = (s: State, validTailNotes: Note[]) => {
        // Determines if the tail note is new (not already in queue)
        const newTailNotes = validTailNotes.filter(
            (note) => !s.tailNotesQueue.includes(note),
        );

        // Only adds the tail note to queue if it is new (not already in queue)
        const tailNotesQueue =
            newTailNotes.length > 0
                ? s.tailNotesQueue.concat(newTailNotes)
                : s.tailNotesQueue;

        return {
            ...s,
            tailNotesQueue: tailNotesQueue,
            allUserPlayedNotesId: s.allUserPlayedNotesId.concat(
                newTailNotes.map((note) => note.id),
            ),
        };
    };
    static handleTailNoteRelease = (s: State, columnIndex: number) => {
        // Find the note to be processed according to the key column
        const releasedTailNotes = s.tailNotesQueue.filter(
            (note) => getColumnIndex(note.pitch) === columnIndex,
        );

        // Accumulate the score based on how long the tail note was held
        // Score awarded for over 75% the tail note duration held
        const validScore = releasedTailNotes.reduce((acc, note) => {
            return acc + (note.heldDuration > note.noteDuration * 0.75 ? 1 : 0);
        }, 0);

        return {
            ...s,
            tailNotesQueue: s.tailNotesQueue.filter(
                (note) => !releasedTailNotes.includes(note),
            ), // Releasing the tail note from the queue
            expiredNotes: s.expiredNotes.concat(releasedTailNotes),
            expiredTailNotes: s.expiredTailNotes.concat(releasedTailNotes),
            score: s.score + validScore,
            combo: s.combo + validScore,
        };
    };
    static handleNormalNote = (s: State, validUserInputNotes: Note[]) => {
        // You miss when you tap and no notes are within accpeted range
        const isMissedTap = validUserInputNotes.length === 0;
        const isRepeatedNote = (note: Note) =>
            s.allUserPlayedNotesId.includes(note.id);

        // The notes that are played by the user, missed or valid
        // Only add notes that are not repeated
        const userPlayedNotes = isMissedTap
            ? s.notesQueue.concat(createRandomNote(s.time)) // Game time is used as seed for random note, as it is always unique
            : s.notesQueue.concat(
                  validUserInputNotes.filter(not(isRepeatedNote)),
              );

        // Combo is increased by 1 for each correct tap
        const currentCombo = isMissedTap ? 0 : s.combo + 1;

        // Multiplier is increased by 0.2 for each consecutive 10 taps
        const currentMultiplier = isMissedTap
            ? 1
            : currentCombo % 10 === 0
              ? s.scoreMultiplier + 0.2
              : s.scoreMultiplier;

        // Total increased score is calculated by the number of valid notes played
        const scoreIncrease =
            (isMissedTap ? 0 : validUserInputNotes.length) * currentMultiplier;

        return {
            ...s,
            notesQueue: userPlayedNotes, // Add the valid user played notes to the queue
            score: Math.round(s.score + scoreIncrease), // Update the score
            scoreMultiplier: currentMultiplier,
            combo: currentCombo,
            allUserPlayedNotesId: s.allUserPlayedNotesId.concat(
                validUserInputNotes.map((note) => note.id),
            ),
        };
    };
}

/**
 * A class that handles the total notes in the state.
 */
class TotalNotes implements Action {
    constructor(public parsedNotes: ReadonlyArray<Note>) {}

    apply(s: State): State {
        return {
            ...s,
            totalNotes: this.parsedNotes,
        };
    }
}

/**
 * A class that reinitialises the game state when restarting game.
 */
class RestartGame implements Action {
    apply(s: State): State {
        return {
            ...initialState,
            highscore: s.highscore,
            totalNotes: s.totalNotes,
        };
    }
}

/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: HTMLElement) => {
    elem.setAttribute("visibility", "visible");
    elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: HTMLElement) => elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
) => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

/**
 * This is the function called on page load. Main game loop
 * is called here.
 */
export function main(
    csvContents: string,
    samples: { [key: string]: Tone.Sampler },
) {
    // Display key mapping with live highlighting of the currently depressed
    showKeys();
    // Canvas elements
    const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
        HTMLElement;
    const preview = document.querySelector(
        "#svgPreview",
    ) as SVGGraphicsElement & HTMLElement;
    const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
        HTMLElement;
    const container = document.querySelector("#main") as HTMLElement;

    svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
    svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);

    // Text fields
    const multiplier = document.querySelector("#multiplierText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;
    const highScoreText = document.querySelector(
        "#highScoreText",
    ) as HTMLElement;
    const combo = document.querySelector("#comboText") as HTMLElement;
    const restartButton = document.getElementById(
        "restartButton",
    ) as HTMLElement;
    restartButton.addEventListener("click", () => {
        restart$.next();
    });

    /** User input */

    const key$ = fromEvent<KeyboardEvent>(document, "keypress");
    const keyRelease$ = fromEvent<KeyboardEvent>(document, "keyup");

    const fromKeyPress = (keyCode: Key) =>
        key$.pipe(
            filter(({ code }) => code === keyCode),
            map(() => new Tap(keyCode, "keydown")),
        );

    const fromKeyRelease = (keyCode: Key) =>
        keyRelease$.pipe(
            filter(({ code }) => code === keyCode),
            map(() => new Tap(keyCode, "keyup")),
        );

    const keyHToggle$ = fromKeyPress("KeyH");
    const keyHRelease$ = fromKeyRelease("KeyH");
    const keyJToggle$ = fromKeyPress("KeyJ");
    const keyJRelease$ = fromKeyRelease("KeyJ");
    const keyKToggle$ = fromKeyPress("KeyK");
    const keyKRelease$ = fromKeyRelease("KeyK");
    const keyLToggle$ = fromKeyPress("KeyL");
    const keyLRelease$ = fromKeyRelease("KeyL");

    const allKeys$ = merge(
        keyHToggle$,
        keyJToggle$,
        keyKToggle$,
        keyLToggle$,
        keyHRelease$,
        keyJRelease$,
        keyKRelease$,
        keyLRelease$,
    );

    /**
     * Parse the csv file into readable Note objects.
     *
     * The notes are streamed into an observable.
     */
    const notes = parseCSV(csvContents);

    /**
     * Helper function to play a note, given its properties.
     * Note is played for the duration of the note.
     */
    const playNote = (note: Note) => {
        const duration = note.end - note.start;

        const tone = Tone.Frequency(note.pitch, "midi").toNote();

        samples[note.instrument_name].triggerAttackRelease(
            tone,
            duration,
            undefined,
            note.velocity,
        );
    };

    /**
     * Helper function to start playing a note.
     * Note is played until a release is triggered.
     */
    const startPlayNote = (note: Note) => {
        const tone = Tone.Frequency(note.pitch, "midi").toNote();

        samples[note.instrument_name].triggerAttack(
            tone,
            undefined,
            note.velocity,
        );
    };

    /**
     * Helper function to end a note.
     * Note playing is stopped immediately.
     */
    const endPlayNote = (note: Note) => {
        const tone = Tone.Frequency(note.pitch, "midi").toNote();
        samples[note.instrument_name].triggerRelease(tone);
    };

    // Creates an observable for each note
    const createNoteObservable = (note: Note): Observable<Note> =>
        timer(note.start * 1000).pipe(
            map(() => note),
            take(1),
        );

    /**
     * Renders the current state to the canvas.
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */
    const render = (s: State, onFinish: () => void) => {
        // Creates a note SVG element
        const createNoteElement = (svg: HTMLElement, note: Note) => {
            const columnIndex = getColumnIndex(note.pitch);
            const noteSVG = createSvgElement(svg.namespaceURI, "circle", {
                id: note.id,
                r: `${NotePreset.RADIUS}`,
                cx: columns[columnIndex].position,
                cy: "0", // Start at the top
                style: columns[columnIndex].color,
                class: "note",
                stroke: "transparent",
            });
            attr(noteSVG, { cy: note.yPos });
            svg.appendChild(noteSVG);
            return noteSVG;
        };

        // Creates a tail note SVG element
        const createTailNoteElement = (svg: HTMLElement, note: Note) => {
            const columnIndex = getColumnIndex(note.pitch);
            const tailNoteSVG = createSvgElement(svg.namespaceURI, "g", {
                id: note.id,
                class: "tail-note",
            });

            const tail = createSvgElement(svg.namespaceURI, "line", {
                x1: columns[columnIndex].position,
                y1: "0", // start
                x2: columns[columnIndex].position,
                y2: note.yPos.toString(), // end
                class: "tail",
                stroke: columns[columnIndex].tailColor || "black",
                "stroke-width": NotePreset.TAIL_WIDTH.toString(),
            });

            const noteCircle = createSvgElement(svg.namespaceURI, "circle", {
                r: `${NotePreset.RADIUS}`,
                cx: columns[columnIndex].position,
                cy: "0",
                style: columns[columnIndex].color,
                class: "note",
                stroke: "transparent",
            });

            tailNoteSVG.appendChild(tail);
            tailNoteSVG.appendChild(noteCircle);
            attr(tailNoteSVG, { cy: note.yPos });
            svg.appendChild(tailNoteSVG);

            return tailNoteSVG;
        };

        // Play all the notes in the queue (background and valid user tapped notes)
        s.notesQueue.forEach((note) => {
            playNote(note);
        });

        // Rendering user played notes from top to bottom
        s.notes.forEach((note) => {
            if (note.user_played == "True") {
                const n =
                    document.getElementById(note.id) ||
                    createNoteElement(svg, note);
                attr(n, { cy: note.yPos });
            }
        });

        // Renders tail notes from top to bottom
        s.tailNotes.forEach((note) => {
            const tn =
                document.getElementById(note.id) ||
                createTailNoteElement(svg, note);

            // Destucutring the tailnote element into its tail and note components
            const [t, n] = tn!.children;
            attr(tn, { cy: note.yPos });
            // Update the tail and the note's position
            attr(t, {
                y1: note.tail!.y1Pos.toString(),
                y2: note.yPos.toString(),
            });
            attr(n, { cy: note.yPos });
        });

        // Renders tail notes that are being held down
        s.tailNotesQueue.forEach((note) => {
            const tn =
                document.getElementById(note.id) ||
                createTailNoteElement(svg, note);
            const [t, n] = tn!.children;
            attr(tn, { cy: note.yPos });
            // Update the tail and the note's position
            attr(t, {
                y1: note.tail!.y1Pos.toString(), // Always start the tail from the top
                y2: note.yPos.toString(), // Extend the tail to the current position
            });
            attr(n, { cy: note.yPos }); // Move the note to the current position
        });

        // Starts playing the tail notes
        s.tailNotesQueue.forEach((note) => {
            // Ensures tail note played only once, when it is initially held down
            if (note.heldDuration === 1) {
                startPlayNote(note);
            }
        });

        // Ending the tail note audio
        s.expiredTailNotes
            .filter((note) => isNotNullOrUndefined(note.tail))
            .forEach((note) => {
                endPlayNote(note);
            });

        // Removing notes that have expired
        s.expiredNotes
            .map((note) => document.getElementById(note.id))
            .filter(isNotNullOrUndefined)
            .forEach((n) => {
                try {
                    svg.removeChild(n);
                } catch (e) {
                    console.log("Unable to remove note ", n.id);
                }
            });

        // Setting canvas text
        scoreText.textContent = s.score.toString();
        multiplier.textContent = parseFloat(
            s.scoreMultiplier.toFixed(1),
        ).toString();
        combo.textContent = s.combo.toString();
        highScoreText.textContent = s.highscore.toString();

        // Show game over screen when the game ends
        if (s.gameEnd) {
            console.log("game ended");
            onFinish();
            show(gameover);
        } else {
            hide(gameover);
        }
    };

    /**
     * Implement the main controls here.
     * When the key corresponding to the note is pressed, play the note if the note is within the
     * area of the column base.
     */

    /** Determines the rate of time steps */
    const tick$ = interval(Constants.TICK_RATE_MS);

    /** Observable that emits when the game is started/restarted */
    const restart$ = new Subject<void>();

    const restartMidGame$ = restart$.pipe(map(() => new RestartGame()));
    const gameStream$ = restart$.pipe(
        startWith(0),
        switchMap(() => createGameStream()),
    );

    // Switchmap replaces the stream with a new identical stream when outer observable emits, in this case restarts
    const allNotes$ = restart$.pipe(
        startWith(0),
        switchMap(() =>
            from(notes).pipe(
                filter(
                    (note) =>
                        !(
                            isNaN(note.start) ||
                            isNaN(note.end) ||
                            isNaN(note.pitch)
                        ),
                ), // Only process valid notes from the csv
                mergeMap(createNoteObservable),
                map((note) => new AddNote(note)),
            ),
        ),
    );

    // Initialises the total notes once every game stream
    const initTotalNotes$ = of(new TotalNotes(notes));

    /**
     * Returns a main game pipeline.
     * Handles state and render by merge the observable streams and rendering the state every game tick.
     */
    function createGameStream(): Observable<State> {
        // Merge all the game observable sources into a single stream
        const source$ = merge(
            initTotalNotes$,
            allNotes$,
            allKeys$,
            tick$.pipe(map((timeElapsed) => new Tick(timeElapsed))),
            restartMidGame$,
        );

        // Update the state based on the actions emitted by the merged observables
        const state$: Observable<State> = source$.pipe(
            scan(updateState, initialState),
        );

        return state$;
    }

    // Subscribe to the game stream and render the state
    const subscription: Subscription = gameStream$.subscribe((s: State) => {
        render(s, () => subscription.unsubscribe());
    });
}

/**
 * Retrieved from FIT2102 workshop4Solutions
 * Display key mapping with live highlighting of the currently depressed key
 */
function showKeys() {
    function showKey(k: Key) {
        const arrowKey = document.getElementById(k);
        // getElement might be null, in this case return without doing anything
        if (!arrowKey) return;
        const o = (e: Event) =>
            fromEvent<KeyboardEvent>(document, e).pipe(
                filter(({ code }) => code === k),
            );
        o("keydown").subscribe((e) => arrowKey.classList.add("highlight"));
        o("keyup").subscribe((_) => arrowKey.classList.remove("highlight"));
    }
    showKey("KeyH");
    showKey("KeyJ");
    showKey("KeyK");
    showKey("KeyL");
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const isGitHubPages = hostname.includes("darylboon.tech");

    console.log("protocol", protocol);
    console.log("hostname", hostname);
    console.log("port", port);

    const baseUrl = isGitHubPages
        ? `${protocol}//${hostname}${port ? `:${port}` : ""}`
        : "./";

    console.log("baseUrl", baseUrl);

    // Load in the instruments and then start your game!
    const samples = SampleLibrary.load({
        instruments: [
            "bass-electric",
            "violin",
            "piano",
            "trumpet",
            "saxophone",
            "trombone",
            "flute",
        ], // SampleLibrary.list,
        baseUrl: `${baseUrl}/assets/samples/`,
    });

    const startGame = (contents: string) => {
        document.body.addEventListener(
            "mousedown",
            function () {
                main(contents, samples);
            },
            { once: true },
        );
    };

    Tone.ToneAudioBuffer.loaded().then(() => {
        for (const instrument in samples) {
            samples[instrument].toDestination();
            samples[instrument].release = 0.5;
        }

        fetch(`${baseUrl}/assets/${Constants.SONG_NAME}.csv`)
            .then((response) => response.text())
            .then((text) => startGame(text))
            .catch((error) =>
                console.error("Error fetching the CSV file:", error),
            );
    });
}
