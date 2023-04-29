/**
 * Modernization of code found at
 * http://www.openjs.com/scripts/events/keyboard_shortcuts/
 * Version : 2.01.B
 * By Binny V A
 * License : BSD
 */
export class Shortcut {
    constructor() {
        //All the shortcuts are stored in this array
        this.all_shortcuts = {}
    }

    add (shortcut_combinations, callbacks, opt) {
        if (typeof shortcut_combinations == 'undefined') return;
        if (!Array.isArray(shortcut_combinations)) shortcut_combinations = [shortcut_combinations];

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
                if (typeof opt[dfo] == 'undefined') opt[dfo] = default_options[dfo];
            }
        }

        let ele = opt.target;
        if (typeof opt.target == 'string') ele = document.getElementById(opt.target);
        const ths = this;
        for (const i in shortcut_combinations) shortcut_combinations[i] = shortcut_combinations[i].toLowerCase();

        // The function to be called at keypress
        const onKeyPress = function (e) {
            let code;
            // Find Which key is pressed
            if (e.which) code = e.which;
            else if (e.keyCode) code = e.keyCode;

            let character = String.fromCharCode(code).toLowerCase();

            if (code == 188) character = ","; //If the user presses , when the type is onkeydown
            if (code == 190) character = "."; //If the user presses . when the type is onkeydown

            let keys = [];
            for (const i in shortcut_combinations) keys.push(shortcut_combinations[i].split("+"));

            // Key Pressed - counts the number of valid key presses - if it is same as the number of keys, the shortcut function is invoked
            let kp = 0;

            // Work around for stupid Shift key bug created by using lowercase - as a result the shift+num combination was broken
            const shift_nums = {
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
            const special_keys = {
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

            const modifiers = {
                shift: { wanted: false, pressed: false },
                ctrl: { wanted: false, pressed: false },
                alt: { wanted: false, pressed: false },
                meta: { wanted: false, pressed: false}	//Meta is Mac specific
            };

            if (e.ctrlKey) modifiers.ctrl.pressed = true;
            if (e.shiftKey) modifiers.shift.pressed = true;
            if (e.altKey) modifiers.alt.pressed = true;
            if (e.metaKey) modifiers.meta.pressed = true;

            for (let i = 0, k; k = keys[i], i < keys.length; i++) {
                //Modifiers
                if (k == 'ctrl' || k == 'control') {
                    kp++;
                    modifiers.ctrl.wanted = true;
                } else if (k == 'shift') {
                    kp++;
                    modifiers.shift.wanted = true;
                } else if (k == 'alt') {
                    kp++;
                    modifiers.alt.wanted = true;
                } else if (k == 'meta') {
                    kp++;
                    modifiers.meta.wanted = true;
                } else if (k.length > 1) { //If it is a special key
                    if (special_keys[k] == code) kp++;
                } else if (opt['keycode']) {
                    if (opt['keycode'] == code) kp++;
                } else { //The special keys did not match
                    if (character == k) {
                        kp++;
                    } else {
                        if (shift_nums[character] && e.shiftKey) { //Stupid Shift key bug created by using lowercase
                            character = shift_nums[character];
                            if (character == k) kp++;
                        }
                    }
                }
            }

            if (
                kp == keys.length &&
                modifiers.ctrl.pressed == modifiers.ctrl.wanted &&
                modifiers.shift.pressed == modifiers.shift.wanted &&
                modifiers.alt.pressed == modifiers.alt.wanted &&
                modifiers.meta.pressed == modifiers.meta.wanted
            ) {
                callbacks(e);

                if (!opt['propagate']) { // Stop the event
                    // e.cancelBubble is supported by IE - this will kill the bubbling process.
                    e.cancelBubble = true;
                    e.returnValue = false;

                    // e.stopPropagation works in Firefox.
                    if (e.stopPropagation) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    // return false;
                }
            }
        };
        for (const i in shortcut_combinations) {
            const shortcut = shortcut_combinations[i];
            this.all_shortcuts[shortcut] = {
                'callback': onKeyPress,
                'target': ele,
                'event': opt['type']
            };
        }
        // Attach the function with the event
        if (ele.addEventListener) ele.addEventListener(opt['type'], onKeyPress, false);
        else if (ele.attachEvent) ele.attachEvent('on' + opt['type'], onKeyPress);
        else ele['on' + opt['type']] = onKeyPress;
    }

    // Remove the shortcut - just specify the shortcut and I will remove the binding
    remove (shortcut_combinations) {
        if (typeof shortcut_combinations == 'undefined') return;
        if (!Array.isArray(shortcut_combinations)) shortcut_combinations = [shortcut_combinations];

        for(const i in shortcut_combinations) {
            const shortcut = shortcut_combinations[i].toLowerCase();
            delete (this.all_shortcuts[shortcut])

            const binding = this.all_shortcuts[shortcut];
            if (!binding) continue;

            const type = binding['event'];
            const ele = binding['target'];
            let callbacks = binding['callback'];
            if (!Array.isArray(callbacks)) {
                callbacks = [callbacks];
            }

            for (const j in callbacks) {
                const callback = callbacks[i];
                if (ele.detachEvent) ele.detachEvent('on' + type, callback);
                else if (ele.removeEventListener) ele.removeEventListener(type, callback, false);
                else ele['on' + type] = false;
            }
        }
    }
};

Shortcut.add = (shortcut_combinations, callbacks, opt) => (new Shortcut()).add(
    shortcut_combinations,
    callbacks,
    opt,
);

Shortcut.remove = (shortcut_combinations) => (new Shortcut()).remove(shortcut_combinations);
