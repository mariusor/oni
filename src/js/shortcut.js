/**
 * Based on code from http://www.openjs.com/scripts/events/keyboard_shortcuts/
 * Version : 2.01.B
 * By Binny V A
 * License : BSD
 */
export const Shortcut = {
    allShortcuts: {},

    add: function (shortcutCombinations, callbacks, opt) {
        if (typeof shortcutCombinations === 'undefined') return;
        if (!Array.isArray(shortcutCombinations)) shortcutCombinations = [shortcutCombinations];
        if (!Array.isArray(callbacks)) callbacks = [callbacks];

        let ele = opt.target;
        if (!ele) return;

        // Provide a set of default options
        const default_options = {
            'type': 'keydown',
            'propagate': false,
            'target': document,
            'keycode': false
        };
        if (!opt) {
            opt = default_options;
        } else {
            for (const dfo in default_options) {
                if (typeof opt[dfo] === 'undefined') opt[dfo] = default_options[dfo];
            }
        }

        for (const i in shortcutCombinations) shortcutCombinations[i] = shortcutCombinations[i].toLowerCase();

        // The function to be called at keypress
        const bindFn = function (e) {
            // Find Which key is pressed
            if (!e.keyCode) return;
            const code = e.keyCode;

            const modifiers = {
                shift: { wanted: false, pressed: false },
                ctrl: { wanted: false, pressed: false },
                alt: { wanted: false, pressed: false },
                // Meta for Mac
                meta: { wanted: false, pressed: false }
            };

            if (e.ctrlKey) modifiers.ctrl.pressed = true;
            if (e.shiftKey) modifiers.shift.pressed = true;
            if (e.altKey) modifiers.alt.pressed = true;
            if (e.metaKey) modifiers.meta.pressed = true;

            if (shortcutMatches(shortcutCombinations, code, modifiers)) {
                if (!opt['propagate']) { // Stop the event
                    if (e.stopPropagation) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }

                if (!callbacks) return;

                console.debug(`Executing command for shortcut ${shortcutCombinations}`, callbacks);
                for (const i in callbacks) {
                    callbacks[i](e);
                }
            }
        };

        for (const i in shortcutCombinations) {
            const shortcut = shortcutCombinations[i];
            this.allShortcuts[shortcut] = {
                'callback': bindFn,
                'target': ele,
                'event': opt['type'],
            };
        }
        // Attach the function with the event
        if (ele.addEventListener) {
            ele.addEventListener(opt['type'], bindFn);
            //console.debug(`Bound ${opt['type']} event for shortcut ${shortcutCombinations}`);
        } else {
            console.error(`Unable to bind ${opt['type']} event`);
        }
    },

    // Remove the shortcut - just specify the shortcut and I will remove the binding
    remove: function (shortcut_combinations) {
        if (typeof shortcut_combinations === 'undefined') return;
        if (!Array.isArray(shortcut_combinations)) shortcut_combinations = [shortcut_combinations];

        for(const i in shortcut_combinations) {
            const shortcut = shortcut_combinations[i].toLowerCase();
            delete (this.allShortcuts[shortcut])

            const binding = this.allShortcuts[shortcut];
            if (!binding) continue;

            const type = binding['event'];
            const ele = binding['target'];
            let callback = binding['callback'];
            if (ele.removeEventListener) {
                console.debug(`removing event ${type}`)
                ele.removeEventListener(type, callback, false);
            }
        }
    },
};

function shortcutMatches(shortcutCombinations, code, modifiers) {
    let character = String.fromCharCode(code).toLowerCase();

    if (code === 188) character = ","; // If the user presses , when the type is onkeydown
    if (code === 190) character = "."; // If the user presses . when the type is onkeydown

    // Work around for stupid Shift key bug created by using lowercase - as a result the shift+num combination was broken
    const shiftNums = {
        "`": "~",
        "1": "!",
        "2": "@",
        "3": "#",
        "4": "$",
        "5": "%",
        "6": "^",
        "7": "&",
        "8": "*",
        "9": "(",
        "0": ")",
        "-": "_",
        "=": "+",
        ";": ":",
        "'": "\"",
        ",": "<",
        ".": ">",
        "/": "?",
        "\\": "|"
    };
    // Special Keys - and their codes
    const specialKeys = {
        'esc': 27,
        'escape': 27,
        'tab': 9,
        'space': 32,
        'return': 13,
        'enter': 13,
        'backspace': 8,

        'scrolllock': 145,
        'scroll_lock': 145,
        'scroll': 145,
        'capslock': 20,
        'caps_lock': 20,
        'caps': 20,
        'numlock': 144,
        'num_lock': 144,
        'num': 144,

        'pause': 19,
        'break': 19,

        'insert': 45,
        'home': 36,
        'delete': 46,
        'end': 35,

        'pageup': 33,
        'page_up': 33,
        'pu': 33,

        'pagedown': 34,
        'page_down': 34,
        'pd': 34,

        'left': 37,
        'up': 38,
        'right': 39,
        'down': 40,

        'f1': 112,
        'f2': 113,
        'f3': 114,
        'f4': 115,
        'f5': 116,
        'f6': 117,
        'f7': 118,
        'f8': 119,
        'f9': 120,
        'f10': 121,
        'f11': 122,
        'f12': 123
    };

    for (const i in shortcutCombinations) {
        const keys = shortcutCombinations[i].split("+");

        // Key Pressed - counts the number of valid key presses - if it is same as the number of keys, the shortcut function is invoked
        let kp = 0;

        for (let i = 0, k; k = keys[i], i < keys.length; i++) {
            // Modifiers
            if (k === 'ctrl' || k === 'control') {
                kp++;
                modifiers.ctrl.wanted = true;
            } else if (k === 'shift') {
                kp++;
                modifiers.shift.wanted = true;
            } else if (k === 'alt') {
                kp++;
                modifiers.alt.wanted = true;
            } else if (k === 'meta') {
                kp++;
                modifiers.meta.wanted = true;
            } else if (k.length > 1) { //If it is a special key
                if (specialKeys[k] === code) kp++;
            } else { // The special keys did not match
                if (character === k) {
                    kp++;
                } else {
                    if (shiftNums[character] || modifiers.shift?.pressed) {
                        // Stupid Shift key bug created by using lowercase
                        character = shiftNums[character];
                        if (character === k) kp++;
                    }
                }
            }
        }

        return kp === keys.length && modifiers.ctrl.pressed === modifiers.ctrl.wanted &&
            modifiers.shift.pressed === modifiers.shift.wanted && modifiers.alt.pressed === modifiers.alt.wanted &&
            modifiers.meta.pressed === modifiers.meta.wanted;
    }
    return false;
}
