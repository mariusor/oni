import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {execCommand, getSelection, showError} from "./utils";
import {Shortcut} from "./shortcut";
import {when} from "lit-html/directives/when.js";
import {ActivityPubObject} from "./activity-pub-object";

// Positioning library
import {autoPlacement, computePosition, offset, shift} from '@floating-ui/dom';
import {map} from "lit-html/directives/map.js";

export class TextEditor extends LitElement {
    static styles = [
        ActivityPubObject.styles,
        css`
        :host oni-text-editor-toolbar {
          --toolbar-width: max-content;
          --toolbar-height: min-content;
          --toolbar-background-top: white;
          --toolbar-background-bottom: silver;
          --toolbar-on-background: white;
          --toolbar-on-active-background: #a4a4a4;
        }
        :host oni-text-editor-toolbar {
          height: var(--toolbar-height);
          max-width: var(--toolbar-width);
          overscroll-behavior: contain;
          overflow-y: auto;
          scrollbar-width: none;
          color: var(--toolbar-on-active-background);
          background: linear-gradient(var(--toolbar-background-top), var(--toolbar-background-bottom));
          border: 1px solid var(--toolbar-on-background);
          pointer-events: auto;
          font-size: .6rem;
        }
        :host {
          --editor-background: transparent;
          display: inline-block;
          width: 100%;
        }
        :host body {
          margin: 0;
          padding: 0;
          width: 100%;
          position: relative;
        }
    `];

    static properties = {
        root: {type: Element},
        content: {type: String},
        active: {type: Boolean},
    };

    constructor() {
        super();
    }

    async firstUpdated(props) {
        const elem = this.getRootNode().querySelector("oni-text-editor slot");
        this.content = elem?.innerHTML ?? "";
        this.reset();
    }

    makeEditable() {
        this.active = true;
        this.setAttribute("contenteditable", "");
        this.contentUpdate();
        this.root.setAttribute("contenteditable", "");
    }

    makeReadOnly() {
        this.active = false;
        this.removeAttribute("contenteditable");
        this.contentUpdate();
        this.root.removeAttribute("contenteditable");
    }

    contentUpdate() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.content, "text/html");
        this.root = doc.querySelector("body");
    }

    commandsInit() {
        for (const i in commands) {
            const c = commands[i];
            if (!isValidCommand(c.execCommand)) continue;

            Shortcut.add(
                c.shortcut,
                (e) => {
                    execCommand(c, this);
                    this.content = this.root.innerHTML;
                },
                {type: 'keydown', propagate: false, target: this.root}
            );
            //console.debug(`Added shortcut ${c.shortcut} for element ${this.root.innerText.substring(0, 32)}...`);
        }
    }

    reset() {
        this.contentUpdate();

        if (!this.isContentEditable) return;

        this.commandsInit();

        document.execCommand("defaultParagraphSeparator", true, "br");
        //root.setAttribute("contenteditable", "");
        //this.addEventListener('focusin', () => this.active = true);
        this.addEventListener('blur', this.makeReadOnly);
        this.addEventListener('drop', this.handleDrop);
        this.addEventListener('dragenter', this.dragAllowed);
        this.addEventListener('dragover', this.dragAllowed);
        this.addEventListener('image.upload', (e) => this.handleFiles(e.detail));
    }

    handleDrop(e) {
        if (!e.dataTransfer.types.filter((i) => i.match('image.*')).length === 0) {
            console.warn("No supported elements for drop.");
            return;
        }

        this.handleFiles(e.dataTransfer.files);

        e.stopPropagation();
        e.preventDefault();
    }

    dragAllowed(e) {
        if (!e.dataTransfer.types.filter((i) => i.match('image.*')).length === 0) {
            console.warn("No supported elements for drag and drop.");
            return;
        }

        e.stopPropagation();
        e.preventDefault();
    }

    handleFiles(files) {
        if (!files) return;

        const selection = getSelection(this)
        const appendImage = (progress) => {
            const f = progress.target

            // NOTE(marius): replacing the selection with the image doesn't seem to work very well.
            // I need to research more. For now, appending the images at the end of the editable block
            // seems OK.

            const img = document.createElement("img");
            img.src = f.result;
            img.title = f.name;
            img.dataSize = f.size;
            img.dataName = f.name;
            img.style.maxWidth = '100%';

            if (selection?.type === "Range") {
                for (let i = 0; i < selection.rangeCount; i++) {
                    const range = selection.getRangeAt(i);

                    let parent = range.commonAncestorContainer;
                    if (parent.nodeType === Node.TEXT_NODE) {
                        parent = parent.parentNode;
                    }
                    parent.appendChild(img);
                }
            } else {
                this.root.append(img);
            }
        }

        for (let i = 0, f; f = files[i], f; i++) {
            if (!f.type.match('image.*')) {
                showError(`Files of type ${f.type} are not supported for upload.`);
                continue;
            }
            if (f.size > 256000) {
                showError("Image attachment is too large (max. 256Kb). ")
                continue;
            }


            const reader = new FileReader();
            reader.addEventListener("load", appendImage);
            reader.readAsDataURL(f);
        }
    }

    render() {
        return html`${this.root}${when(this.active,
                () => html`<oni-text-editor-toolbar>${html`${this.renderToolbar()}`}</oni-text-editor-toolbar> `,
                () => nothing
        )} `;
    }

    renderToolbar() {
        if (!this.root) return nothing;
        if (!this.isContentEditable) return nothing;
        return this.renderCommands(commands);
    }

    renderCommands(commands) {
        if (!this.isContentEditable) return nothing;
        let buttons = [];
        for (let cmdName in commands) {
            const cmd = commands[cmdName];
            buttons.push(cmdName == 'insertImage' ? this.renderImageUpload(cmd) : this.renderButton(cmd));
        }
        return html`${map(buttons, n => html`${n}`)}`;
    }

    renderButton(n) {
        return html`
            <button title="${n.desc}\nShortcut: ${n.shortcut}" class=${classMap({"active": isActiveTag(n.active)})} @click=${(e) => {
                execCommand(n, this);
                this.content = this.root.innerHTML;
            }}>
                ${unsafeHTML(n.toolbarHtml)}
            </button>`;
    }

    renderImageUpload (n) {
        return html`<input type=file multiple style="display: none"
                           @change=${(e) => this.dispatchEvent(
                                   new CustomEvent("image.upload", {
                                       trusted: true,
                                       bubbles: true,
                                       detail: e.target?.files,
                                   })
                           )}
        > ${this.renderButton(n)}`;
    }
}

// Events to turn on/off the tooltip
const enterEvents = ['focusin'];
const leaveEvents = ['focusout'];

export class TextEditorToolbar extends LitElement {
    static properties = {
        showing: {reflect: true, type: Boolean},
        offset: {type: Number},
    };

    static styles = css`
    :host {
      /* Position fixed to help ensure the tooltip is "on top" */
      position: fixed;
      padding: 4px;
      border-radius: 4px;
      display: inline-block;
      pointer-events: none;

      /* Animate in */
      opacity: 0;
      transform: scale(0.75);
      transition: opacity, transform;
      transition-duration:  0.33s;
      font-size: 60%;
    }
    :host([showing]) {
      opacity: 1;
      transform: scale(1);
    }
  `;

    constructor() {
        super();
        // Finish hiding at end of animation
        this.addEventListener('transitionend', this.finishHide);
        // Attribute for styling "showing"
        this.showing = true;
        // Position offset
        this.offset = 4;
    }

    connectedCallback() {
        super.connectedCallback();
        // Setup target if needed
        this.target ??= this.previousElementSibling;
        // Ensure hidden at start
        this.finishHide();
    }

    // Target for which to show tooltip
    _target = null;

    get target() {
        return this._target;
    }

    set target(target) {
        if (!target) return;

        if (this._target) {
            // Remove events from existing target
            enterEvents.forEach((name) => this._target.removeEventListener(name, this.show));
            leaveEvents.forEach((name) => this._target.removeEventListener(name, this.hide));
        }
        // Add events to new target
        enterEvents.forEach((name) => target.addEventListener(name, this.show));
        leaveEvents.forEach((name) => target.addEventListener(name, this.hide));
        this._target = target;
    }

    show = () => {
        this.style.cssText = '';
        this.showing = true;
    };

    hide = () => {
        setTimeout(() => {
            this.showing = false;
        }, 2000);
    };

    finishHide = () => {
        if (!this.showing) {
            this.style.display = 'none';
        }
    };

    render() {
        computePosition(this.target, this, {
            placement: "top-start",
            middleware: [
                offset(this.offset),
                shift(),
                autoPlacement({alignment: 'start', allowedPlacements: ['top', 'bottom']}),
            ],
        }).then(({x, y}) => {
            //console.debug(`pos ${x}x${y}`)
            this.style.left = `${x}px`;
            this.style.top = `${y}px`;
        });
        return html`<slot></slot>`;
    }
}

const commands = {
    bold: {
        shortcut: "Ctrl+b",
        toolbarHtml: "<strong>B</strong>",
        execCommand: "bold",
        desc: "Toggles bold on/off for the selection or at the insertion point.",
        active: "b",
    },
    italic: {
        shortcut: "Ctrl+i",
        toolbarHtml: "<em>I</em>",
        execCommand: "italic",
        active: "i",
        desc: "Toggles italics on/off for the selection or at the insertion point.",
    },
    underline: {
        shortcut: "Ctrl+u",
        toolbarHtml: "<span style='text-decoration: underline'>U</span>",
        execCommand: "underline",
        active: "u",
        desc: "Toggles underline on/off for the selection or at the insertion point.",
    },
    removeFormat: {
        shortcut: "Ctrl+m",
        execCommand: ["removeFormat", "unlink", "formatBlock"],
        execCommandValue: [null, null, ["<P>"]],
        toolbarHtml: "<span>&#11034;</span>",
        desc: "Removes the formatting from the selection.",
    },
    createLink: {
        shortcut: "Ctrl+l",
        toolbarHtml: "<span>&#128279;</span>",
        execCommand: "createlink",
        execCommandValue: function () {
            return prompt("Enter URL:", "https://");
        },
        desc: "Creates an anchor link from the selection, only if there is a selection. This requires the HREF URI string to be passed in as a value argument. The URI must contain at least a single character, which may be a white space.",
    },
    insertHorizontalRule: {
        shortcut: "Ctrl+Alt+h",
        execCommand: "inserthorizontalrule",
        toolbarHtml: "<span>&#9473;</span>",
        active: "hr",
        desc: "Inserts a horizontal rule at the insertion point (deletes selection).",
    },
    strike: {
        shortcut: "Ctrl+Alt+t",
        toolbarHtml: "<strike>S</strike>",
        execCommand: "strikethrough",
        active: "strike",
        desc: "Toggles strikethrough on/off for the selection or at the insertion point.",
    },
    blockquote: {
        shortcut: "Ctrl+q",
        execCommandValue: ["<BLOCKQUOTE>"],
        toolbarHtml: "<span>&rdquor;</span>",
        execCommand: "formatBlock",
        desc: "Adds a blockquote tag around the line containing the current selection, replacing the block element containing the line if one exists.",
    },
    code: {
        shortcut: "Ctrl+Alt+c",
        execCommand: "formatBlock",
        execCommandValue: ["<PRE>"],
        toolbarHtml: "<code style='font-size:.8em'>{&nbsp;}</code>",
        desc: "Adds an HTML preformatted tag around the line containing the current selection, replacing the block element containing the line if one exists.",
    },
    ol: {
        shortcut: "Ctrl+Alt+o",
        toolbarHtml: "<span>1.</span>",
        execCommand: "insertorderedlist",
        active: "ol",
        desc: "Creates a numbered ordered list for the selection or at the insertion point.",
    },
    ul: {
        shortcut: "Ctrl+Alt+u",
        toolbarHtml: "<span>&bullet;</span>",
        execCommand: "insertUnorderedList",
        active: "ul",
        desc: "Creates a bulleted unordered list for the selection or at the insertion point.",
    },
    sup: {
        shortcut: "Ctrl+.",
        execCommand: "superscript",
        toolbarHtml: "<span style='font-size:.7em'>x<sup>2</sup></span>",
        desc: "Toggles superscript on/off for the selection or at the insertion point.",
    },
    sub: {
        shortcut: "Ctrl+Shift+.",
        execCommand: "subscript",
        toolbarHtml: "<span style='font-size:.7em'>x<sub style='font-size:.6em'>2</sub></span>",
        desc: "Toggles subscript on/off for the selection or at the insertion point.",
    },
    p: {
        shortcut: "Ctrl+Alt+0",
        execCommand: "formatBlock",
        execCommandValue: ["<P>"],
        toolbarHtml: "<span title='Paragraph'>P</span>",
        desc: "Adds an paragraph tag around the line containing the current selection, replacing the block element containing the line if one exists.",
    },
    h1: {
        shortcut: "Ctrl+Alt+1",
        execCommand: "formatBlock",
        execCommandValue: ["<H1>"],
        toolbarHtml: "<span>H1</span>",
        desc: "Adds a level 1 heading tag around a selection or insertion point line.",
    },
    h2: {
        shortcut: "Ctrl+Alt+2",
        execCommand: "formatBlock",
        execCommandValue: ["<H2>"],
        toolbarHtml: "<span>H2</span>",
        desc: "Adds a level 2 heading tag around a selection or insertion point line.",
    },
    h3: {
        shortcut: "Ctrl+Alt+3",
        execCommand: "formatBlock",
        execCommandValue: ["<H3>"],
        toolbarHtml: "<span>H3</span>",
        desc: "Adds a level 3 heading tag around a selection or insertion point line.",
    },
    h4: {
        shortcut: "Ctrl+Alt+4",
        execCommand: "formatBlock",
        execCommandValue: ["<H4>"],
        toolbarHtml: "<span>H4</span>",
        desc: "Adds a level 4 heading tag around a selection or insertion point line.",
    },
    h5: {
        shortcut: "Ctrl+Alt+5",
        execCommand: "formatBlock",
        execCommandValue: ["<H5>"],
        toolbarHtml: "<span>H5</span>",
        desc: "Adds a level 5 heading tag around a selection or insertion point line",
    },
    h6: {
        shortcut: "Ctrl+Alt+6",
        execCommand: "formatBlock",
        execCommandValue: ["<H6>"],
        toolbarHtml: "<span>H6</span>",
        desc: "Adds a level 6 heading tag around a selection or insertion point line.",
    },
    indent: {
        shortcut: "Tab",
        toolbarHtml: "<span>&#8677;</span>",
        execCommand: "indent",
        desc: "Indents the line containing the selection or insertion point. In Firefox, if the selection spans multiple lines at different levels of indentation, only the least indented lines in the selection will be indented.",
    },
    outdent: {
        shortcut: ["Ctrl+Tab", "Shift+Tab"],
        toolbarHtml: "<span>&#8676;</span>",
        execCommand: "outdent",
        desc: "Outdents the line containing the selection or insertion point.",
    },
    insertImage: {
        shortcut: "Ctrl+Alt+i",
        toolbarHtml: "<span>&#128444;</span>",
        execCommand: insertImage,
        desc: "Inserts an image at the insertion point (deletes selection). Requires the image SRC URI string to be passed in as a value argument. The URI must contain at least a single character, which may be a white space.",
    }
};

function insertImage (it) {
    it.shadowRoot?.querySelector('oni-text-editor-toolbar input[type=file]')?.click();
}

function isActiveTag(t) {
    let tags = [], root;
    const selection = getSelection(this);
    if (selection?.type === "Range") {
        root = selection?.baseNode;
        if (root) {
            const checkNode = () => {
                const parentTagName = root?.tagName?.toLowerCase()?.trim();
                if (parentTagName) tags.push(parentTagName);
            };
            while (root != null) {
                checkNode();
                root = root?.parentNode;
            }
        }
    }
    return tags.includes(t)
}

const isValidCommand = (cmdName) => (
    typeof cmdName === 'function' ||
    (typeof cmdName === 'string' && document.queryCommandSupported(cmdName))
);
