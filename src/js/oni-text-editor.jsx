import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {showError} from "./utils";
import {Shortcut} from "./shortcut";
import {when} from "lit-html/directives/when.js";
import {ActivityPubObject} from "./activity-pub-object";

// Positioning library
import {autoPlacement, computePosition, offset, shift} from '@floating-ui/dom';

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
          /*width: 100%;*/
        }
        :host body:hover, :host body:focus {
          outline: dashed 2px var(--accent-color);
          outline-offset: 4px;
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

    reset() {
        if (!this.isContentEditable) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(this.content, "text/html");
        document.execCommand("defaultParagraphSeparator", true, "br");

        const root = doc.querySelector("body");
        root.setAttribute("title", "Editable.");
        root.setAttribute("contenteditable", "");
        this.addEventListener('focusin', () => this.active = true);
        this.addEventListener('blur', () => this.active = false);
        this.addEventListener('drop', this.handleDrop);
        this.addEventListener('dragenter', this.dragAllowed);
        this.addEventListener('dragover', this.dragAllowed);
        this.addEventListener('image.upload', (e) => { console.debug(e); this.handleFiles(e.detail)});
        this.root = root;
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

        const appendImage = (progress) => {
            const f = progress.target

            // NOTE(marius): replacing the selection with the image doesn't seem to work very well.
            // I need to research more. For now, appending the images at the end of the editable block
            // seems OK.
            //console.debug(document.getSelection());

            const img = document.createElement("img");
            img.src = f.result;
            img.title = f.name;
            img.dataSize = f.size;
            img.dataName = f.name;
            img.style.maxWidth = '100%';

            this.root.append(img);
        }

        for (let i = 0, f; f = files[i], f; i++) {
            if (!f.type.match('image.*')) {
                showError(`Files of type ${f.type} are not supported for upload.`);
                continue;
            }
            if (f.size > 256000) {
                showError("Image attachment is too large.")
                continue;
            }


            const reader = new FileReader();
            reader.addEventListener("load", appendImage);
            reader.readAsDataURL(f);

            console.debug(f);
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

        const tags = [];
        const selection = document.getSelection();
        let root;
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

        const commands = {
            bold: {
                shortcut: "Ctrl+b",
                toolbarHtml: "<strong>B</strong>",
                execCommand: "bold",
                desc: "Toggles bold on/off for the selection or at the insertion point. (Internet Explorer uses the STRONG tag instead of B.)",
                active: tags.includes("b"),
            },
            italic: {
                shortcut: "Ctrl+i",
                toolbarHtml: "<em>I</em>",
                execCommand: "italic",
                active: tags.includes("i"),
                desc: "Toggles italics on/off for the selection or at the insertion point. (Internet Explorer uses the EM tag instead of I.)",
            },
            underline: {
                shortcut: "Ctrl+u",
                toolbarHtml: "<span style='text-decoration: underline'>U</span>",
                execCommand: "underline",
                active: tags.includes("u"),
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
                desc: "Creates an anchor link from the selection, only if there is a selection. This requires the HREF URI string to be passed in as a value argument. The URI must contain at least a single character, which may be a white space. (Internet Explorer will create a link with a null URI value.)",
            },
            insertHorizontalRule: {
                shortcut: "Ctrl+Alt+h",
                execCommand: "inserthorizontalrule",
                toolbarHtml: "<span>&#9473;</span>",
                desc: "Inserts a horizontal rule at the insertion point (deletes selection).",
            },
            strikethrough: {
                shortcut: "Ctrl+Alt+t",
                toolbarHtml: "<strike>S</strike>",
                execCommand: "strikethrough",
                active: tags.includes("strike"),
                desc: "Toggles strikethrough on/off for the selection or at the insertion point.",
            },
            blockquote: {
                shortcut: "Ctrl+q",
                execCommandValue: ["<BLOCKQUOTE>"],
                toolbarHtml: "<span title='Quote'>&rdquor;</span>",//"&ldquo;&bdquo;",
                execCommand: "formatBlock",
                //desc: "Adds an HTML block-style tag around the line containing the current selection, replacing the block element containing the line if one exists (in Firefox, BLOCKQUOTE is the exception - it will wrap any containing block element). Requires a tag-name string to be passed in as a value argument. Virtually all block style tags can be used (eg. \"H1\", \"P\", \"DL\", \"BLOCKQUOTE\"). (Internet Explorer supports only heading tags H1 - H6, ADDRESS, and PRE, which must also include the tag delimiters &lt; &gt;, such as \"&lt;H1&gt;\".)",
            },
            code: {
                shortcut: "Ctrl+Alt+c",
                execCommand: "formatBlock",
                execCommandValue: ["<PRE>"],
                toolbarHtml: "<code title='Code' style='font-size:.8em'>{&nbsp;}</code>",
                //desc: "Adds an HTML block-style tag around the line containing the current selection, replacing the block element containing the line if one exists (in Firefox, BLOCKQUOTE is the exception - it will wrap any containing block element). Requires a tag-name string to be passed in as a value argument. Virtually all block style tags can be used (eg. \"H1\", \"P\", \"DL\", \"BLOCKQUOTE\"). (Internet Explorer supports only heading tags H1 - H6, ADDRESS, and PRE, which must also include the tag delimiters &lt; &gt;, such as \"&lt;H1&gt;\".)",
            },
            ol: {
                shortcut: "Ctrl+Alt+o",
                toolbarHtml: "<span>1.</span>",
                execCommand: "insertorderedlist",
                active: tags.includes("ol"),
                desc: "Creates a numbered ordered list for the selection or at the insertion point.",
            },
            ul: {
                shortcut: "Ctrl+Alt+u",
                toolbarHtml: "<span>&bullet;</span>",
                execCommand: "insertUnorderedList",
                active: tags.includes("ul"),
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
                toolbarHtml: "<span title='Paragraph'>P</span>"
                //desc: "Adds an HTML block-style tag around the line containing the current selection, replacing the block element containing the line if one exists (in Firefox, BLOCKQUOTE is the exception - it will wrap any containing block element). Requires a tag-name string to be passed in as a value argument. Virtually all block style tags can be used (eg. \"H1\", \"P\", \"DL\", \"BLOCKQUOTE\"). (Internet Explorer supports only heading tags H1 - H6, ADDRESS, and PRE, which must also include the tag delimiters &lt; &gt;, such as \"&lt;H1&gt;\".)",
            },
            h1: {
                shortcut: "Ctrl+Alt+1",
                execCommand: "formatBlock",
                execCommandValue: ["<H1>"],
                toolbarHtml: "<span>H1</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            h2: {
                shortcut: "Ctrl+Alt+2",
                execCommand: "formatBlock",
                execCommandValue: ["<H2>"],
                toolbarHtml: "<span>H2</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            h3: {
                shortcut: "Ctrl+Alt+3",
                execCommand: "formatBlock",
                execCommandValue: ["<H3>"],
                toolbarHtml: "<span>H3</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            h4: {
                shortcut: "Ctrl+Alt+4",
                execCommand: "formatBlock",
                execCommandValue: ["<H4>"],
                toolbarHtml: "<span>H4</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            h5: {
                shortcut: "Ctrl+Alt+5",
                execCommand: "formatBlock",
                execCommandValue: ["<H5>"],
                toolbarHtml: "<span>H5</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            h6: {
                shortcut: "Ctrl+Alt+6",
                execCommand: "formatBlock",
                execCommandValue: ["<H6>"],
                toolbarHtml: "<span>H6</span>",
                desc: "Adds a heading tag around a selection or insertion point line. Requires the tag-name string to be passed in as a value argument (i.e. \"H1\", \"H6\"). (Not supported by Internet Explorer and Safari.)",
            },
            indent: {
                shortcut: "Tab",
                toolbarHtml: "<span>&#8677;</span>",//"&rArr;",
                execCommand: "indent",
                desc: "Indents the line containing the selection or insertion point. In Firefox, if the selection spans multiple lines at different levels of indentation, only the least indented lines in the selection will be indented.",
            },
            outdent: {
                shortcut: ["Ctrl+Tab", "Shift+Tab"],
                toolbarHtml: "<span>&#8676;</span>",//"&lArr;",
                execCommand: "outdent",
                desc: "Outdents the line containing the selection or insertion point.",
            },
            insertImage: {
                shortcut: "Ctrl+Shift+i",
                execCommand: () => this.shadowRoot.querySelector('input[type=file]')?.click(),
                toolbarHtml: "<span>&#128444;</span>",
                desc: "Inserts an image at the insertion point (deletes selection). Requires the image SRC URI string to be passed in as a value argument. The URI must contain at least a single character, which may be a white space. (Internet Explorer will create a link with a null URI value.)",
            },
        };

        return this.renderCommands(commands, root);
    }

    renderCommands(commands, editable) {
        if (!this.isContentEditable) return nothing;
        let elements = [];

        for (const c in commands) {
            const n = commands[c];
            const cmdName = n.execCommand;
            if (typeof cmdName == 'string' && !document.queryCommandSupported(cmdName)) continue;

            Shortcut.add(
                n.shortcut,
                function() { this.exec(n) },
                { type: 'keydown', propagate: false, target: editable}
            );

            if (c === "insertImage") elements.push(this.renderImageUpload(n));
            else elements.push(this.renderButton(n));
        }
        return html`${elements.map(n => html`${n}`)}`
    }

    renderButton(n) {
        return html`
            <button title=${n.desc} class=${classMap({"active": n.active})} @click=${() => { this.exec(n)}}>
                ${unsafeHTML(n.toolbarHtml)}
            </button>`;
    }

    renderImageUpload (n) {
        return html`<input type=file multiple style="display: none"
                           @change="${(e) => {
                               this.dispatchEvent(
                                       new CustomEvent("image.upload", {
                                           trusted: true,
                                           bubbles: true,
                                           detail: e.target?.files,
                                       })
                               );
                           }}"
        >
        <button @click=${n.execCommand}>${unsafeHTML(n.toolbarHtml)}</button>`;
    }

    exec (n) {
        if (!Array.isArray(n.execCommand)) n.execCommand = [n.execCommand];
        if (!Array.isArray(n.execCommandValue)) n.execCommandValue = [n.execCommandValue];

        for (const i in n.execCommand) {
            const command = n.execCommand[i];
            let val = n.execCommandValue[i];

            if (typeof command === "string") {
                // NOTE(marius): this should be probably be replaced with something
                // based on the ideas from here: https://stackoverflow.com/a/62266439
                if (typeof val == 'function') val = val();
                console.debug(`executing command ${command}: ${val}`)
                document.execCommand(command, false, val || '');
            } else {
                command(val);
            }
        }
        this.content = this.root.innerHTML;
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
