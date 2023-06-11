import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {showError} from "./utils";
import {Shortcut} from "./shortcut";
import {when} from "lit-html/directives/when.js";
import {ActivityPubObject} from "./activity-pub-object";

export class TextEditor extends LitElement {
    static styles = [
        ActivityPubObject.styles,
        css`
        :host simple-tooltip {
          --toolbar-width: max-content;
          --toolbar-height: min-content;
          --toolbar-background-top: white;
          --toolbar-background-bottom: silver;
          --toolbar-on-background: white;
          --toolbar-on-active-background: #a4a4a4;
        }
        :host simple-tooltip {
          height: var(--toolbar-height);
          max-width: var(--toolbar-width);
          overscroll-behavior: contain;
          overflow-y: auto;
          scrollbar-width: none;
          color: var(--toolbar-on-active-background);
          background: linear-gradient(var(--toolbar-background-top), var(--toolbar-background-bottom));
          border: 1px solid var(--toolbar-on-background);
          pointer-events: auto;
        }
        :host {
          --editor-background: transparent;
          display: inline-block;
        }
        main {
          width: var(--editor-width);
          height: var(--editor-height);
          display: grid;
          grid-template-areas: "toolbar toolbar" "editor editor";
          grid-template-rows: min-content auto;
          grid-template-columns: auto auto;
        }
        simple-tooltip button { font-family: serif; font-size: 1.2em; }
        :host oni-text-editor-toolbar {
          grid-area: toolbar;
        }
        :host body {
            margin: 0;
            padding: 0;
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
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.content, "text/html");
        document.execCommand("defaultParagraphSeparator", true, "br");

        const root = doc.querySelector("body");
        if (this.isContentEditable) {
            root.setAttribute("contenteditable", "");
            root.addEventListener('focusin', () => this.active = true);
            root.addEventListener('drop', this.handleDrop);
            root.addEventListener('dragenter', this.dragAllowed);
            root.addEventListener('dragover', this.dragAllowed);
            root.addEventListener('image.upload', (e) => this.handleFiles(e.detail));
        }

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

        for (let i = 0, f; f = files[i]; i++) {
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
                () => html`<simple-tooltip>${html`${this.renderToolbar()}`}</simple-tooltip> `,
                () => nothing
        )} `;
    }

    renderToolbar() {
        if (!this.root) return nothing;
        if (!this.isContentEditable) return nothing;

        const tags = [];
        const selection = document.getSelection();
        if (selection?.type === "Range") {
            this.root = selection?.baseNode;
            if (this.root) {
                const checkNode = () => {
                    const parentTagName = this.root?.tagName?.toLowerCase()?.trim();
                    if (parentTagName) tags.push(parentTagName);
                };
                while (this.root != null) {
                    checkNode();
                    this.root = this.root?.parentNode;
                }
            }
        }

        const commands = {
            bold: {
                shortcut: "Ctrl+b",
                toolbarHtml: "<strong title='Bold'>B</strong>",
                execCommand: "bold",
                active: tags.includes("b"),
            },
            italic: {
                shortcut: "Ctrl+i",
                toolbarHtml: "<em title='Italic'>I</em>",
                execCommand: "italic",
                active: tags.includes("i"),
            },
            underline: {
                shortcut: "Ctrl+u",
                toolbarHtml: "<span title='Underscored' style='text-decoration: underline'>U</span>",
                execCommand: "underline",
                active: tags.includes("u"),
            },
            removeFormat: {
                shortcut: "Ctrl+m",
                execCommand: ["removeFormat", "unlink", "formatBlock"],
                execCommandValue: [null, null, ["<P>"]],
                toolbarHtml: "<span title='Remove format'>&#11034;</span>",
            },
            createLink: {
                shortcut: "Ctrl+l",
                toolbarHtml: "<span title='Insert Link'>&#128279;</span>",
                execCommand: "createlink",
                execCommandValue: function () {
                    return prompt("Enter URL:", "https://");
                },
            },
            inserthorizontalrule: {
                shortcut: "Ctrl+Alt+h",
                execCommand: "inserthorizontalrule",
                toolbarHtml: "<span title='Insert horizontal rule'>&#9473;</span>",
            },
            strikethrough: {
                shortcut: "Ctrl+Alt+t",
                toolbarHtml: "<strike title='Strike-through'>S</strike>",
                execCommand: "strikethrough",
                active: tags.includes("strike"),
            },
            // increaseFontSize: {
            //     // NOTE(marius): not working
            //     shortcut: "Ctrl+Alt+=",
            //     execCommand: "increaseFontSize",
            //     toolbarHtml: "<span title='Increase font size' style='font-size:.7em'>&plus;</span>",
            // },
            // decreaseFontSize: {
            //     // NOTE(marius): not working
            //     shortcut: "Ctrl+Alt+m",
            //     execCommand: "decreaseFontSize",
            //     toolbarHtml: "<span title='Decrease font size' style='font-size:.7em'>&minus;</span>",
            // },
            blockquote: {
                shortcut: "Ctrl+q",
                execCommandValue: ["<BLOCKQUOTE>"],
                toolbarHtml: "<span title='Quote'>&rdquor;</span>",//"&ldquo;&bdquo;",
                execCommand: "formatblock",
                command_value: "blockquote",
            },
            code: {
                shortcut: "Ctrl+Alt+c",
                execCommand: "formatBlock",
                execCommandValue: ["<PRE>"],
                toolbarHtml: "<code title='Code' style='font-size:.8em'>{&nbsp;}</code>",
            },
            ol: {
                shortcut: "Ctrl+Alt+o",
                toolbarHtml: "<span title='Ordered List'>1.</span>",
                execCommand: "insertorderedlist",
                active: tags.includes("ol"),
            },
            ul: {
                shortcut: "Ctrl+Alt+u",
                toolbarHtml: "<span title='Unordered List'>&bullet;</span>",
                execCommand: "insertunorderedlist",
                active: tags.includes("ul"),
            },
            sup: {
                shortcut: "Ctrl+.",
                execCommand: "superscript",
                toolbarHtml: "<span title='Superscript' style='font-size:.7em'>x<sup>2</sup></span>",
            },
            sub: {
                shortcut: "Ctrl+Shift+.",
                execCommand: "subscript",
                toolbarHtml: "<span title='Subscript' style='font-size:.7em'>x<sub style='font-size:.6em'>2</sub></span>"
            },
            p: {
                shortcut: "Ctrl+Alt+0",
                execCommand: "formatBlock",
                execCommandValue: ["<P>"],
                toolbarHtml: "<span title='Paragraph'>P</span>"
            },
            h1: {
                shortcut: "Ctrl+Alt+1",
                execCommand: "formatBlock",
                execCommandValue: ["<H1>"],
                toolbarHtml: "<span title='Section heading 1'>H1</span>"
            },
            h2: {
                shortcut: "Ctrl+Alt+2",
                execCommand: "formatBlock",
                execCommandValue: ["<H2>"],
                toolbarHtml: "<span title='Section heading 2'>H2</span>"
            },
            h3: {
                shortcut: "Ctrl+Alt+3",
                execCommand: "formatBlock",
                execCommandValue: ["<H3>"],
                toolbarHtml: "<span title='Section heading 3'>H3</span>"
            },
            h4: {
                shortcut: "Ctrl+Alt+4",
                execCommand: "formatBlock",
                execCommandValue: ["<H4>"],
                toolbarHtml: "<span title='Section heading 4'>H4</span>"
            },
            h5: {
                shortcut: "Ctrl+Alt+5",
                execCommand: "formatBlock",
                execCommandValue: ["<H5>"],
                toolbarHtml: "<span title='Section heading 5'>H5</span>"
            },
            h6: {
                shortcut: "Ctrl+Alt+6",
                execCommand: "formatBlock",
                execCommandValue: ["<H6>"],
                toolbarHtml: "<span title='Section heading 6'>H6</span>"
            },
            // alignLeft: {
            //     shortcut: "Ctrl+Alt+l",
            //     toolbarHtml: "<span title='Align Left'>&#8612;</span>",
            //     execCommand: "justifyleft",
            // },
            // alignRight: {
            //     shortcut: "Ctrl+Alt+r",
            //     toolbarHtml: "<span title='Align Right'>&#8614;</span>",
            //     execCommand: "justifyright",
            // },
            // alignCenter: {
            //     shortcut: "Ctrl+Alt+c",
            //     toolbarHtml: "<span title='Align Center'>&#8633;</span>",
            //     execCommand: "justifycenter",
            // },
            indent: {
                shortcut: "Tab",
                toolbarHtml: "<span title='Indent'>&#8677;</span>",//"&rArr;",
                execCommand: "indent",
            },
            outdent: {
                shortcut: ["Ctrl+Tab", "Shift+Tab"],
                toolbarHtml: "<span title='Decrease Indent'>&#8676;</span>",//"&lArr;",
                execCommand: "outdent",
            },
            insertImage: {
                shortcut: "Ctrl+Shift+i",
                execCommand: () => this.shadowRoot.querySelector('input[type=file]')?.click(),
                toolbarHtml: "<span title='Insert Image'>&#128444;</span>",
            },
        };

        return this.renderCommands(commands);
    }

    renderCommands(commands) {
        if (!this.isContentEditable) return nothing;
        let elements = [];
        const editable = this.root;

        if (!editable) return;

        for (const c in commands) {
            const n = commands[c];

            Shortcut.add(
                n.shortcut,
                function() { this.execCommand(n) },
                { type: 'keydown', propagate: false, target: editable}
            );

            if (c == "insertImage") elements.push(this.renderImageUpload(n));
            else elements.push(this.renderButton(n));
        }
        return html`${elements.map(n => html`${n}`)}`
    }

    renderButton(n) {
        return html`
            <button class=${classMap({"active": n.active})} @click=${() => { this.execCommand(n)}}>
                ${unsafeHTML(n.toolbarHtml)}
            </button>`;
    }

    renderImageUpload (n) {
        return html`<input type=file multiple style="display: none"
                           @change="${(e) => {
                               this.root.dispatchEvent(
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

    execCommand (n) {
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
                document.execCommand(command, true, val);
            } else {
                command(val);
            }
        }
        this.content = this.root.innerHTML;
    }
}

