import {css, html, LitElement} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {showError} from "./utils";
import {Shortcut} from "./shortcut";

export class TextEditor extends LitElement {
    static styles = [css`
        :host {
          --editor-width: 100%;
          --editor-height: 100vh;
          --editor-background: transparent;
        }
        main {
          width: var(--editor-width);
          height: var(--editor-height);
          display: grid;
          grid-template-areas: "toolbar toolbar" "editor editor";
          grid-template-rows: min-content auto;
          grid-template-columns: auto auto;
        }
        :host oni-text-editor-toolbar {
          grid-area: toolbar;
        }
    `];

    static properties = {
        root: {type: Element},
        content: {type: String}
    };

    constructor() {
        super();
        document.addEventListener("image.upload", (e) => this.handleFiles(e.detail));
        document.addEventListener("selectionchange", this.reset);
    }

    async firstUpdated(props) {
        const elem = this.parentElement.querySelector("oni-text-editor slot");
        this.content = elem?.innerHTML ?? "";
        this.reset();
    }

    reset() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.content, "text/html");
        document.execCommand("defaultParagraphSeparator", true, "br");
        const root = doc.querySelector("body");
        root.setAttribute("contenteditable", "");

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
        if (!files) {
            return;
        }

        const appendImage = (progress) => {
            const f = progress.target

            // NOTE(marius): replacing the selection with the image doesn't seem to work very well.
            // I need to research more. For now, appending the images at the end of the editable block
            // seems OK.
            console.debug(document.getSelection());

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

            console.debug(reader);
            console.debug(f);
        }
    }

    render() {
        return html`
            <main>
                <oni-text-editor-toolbar></oni-text-editor-toolbar>
                <div @drop="${this.handleDrop}"
                     @dragenter="${this.dragAllowed}"
                     @dragover="${this.dragAllowed}"
                >${this.root}
                </div>
            </main>`;
    }
}

export class TextEditorToolbar extends LitElement {
    static styles = [css`
    :host {
      --toolbar-width: max-content;
      --toolbar-height: min-content;
      --toolbar-background-top: white;
      --toolbar-background-bottom: silver;
      --toolbar-on-background: white;
      --toolbar-on-active-background: #a4a4a4;
    }
    :host {
      height: var(--toolbar-height);
      width: var(--toolbar-width);
      overscroll-behavior: contain;
      display: inline-block;
      overflow-y: auto;
      scrollbar-width: none;
      color: var(--toolbar-on-active-background);
      background: linear-gradient(var(--toolbar-background-top), var(--toolbar-background-bottom));
      border: 1px solid var(--toolbar-on-background);
    }
    button { font-family: serif; font-size: 1.2em; }
    `];

    constructor() {
        super();
    }

    render() {
        const tags = [];
        const selection = document.getSelection();
        if (selection?.type === "Range") {
            let parentNode = selection?.baseNode;
            if (parentNode) {
                const checkNode = () => {
                    const parentTagName = parentNode?.tagName?.toLowerCase()?.trim();
                    if (parentTagName) tags.push(parentTagName);
                };
                while (parentNode != null) {
                    checkNode();
                    parentNode = parentNode?.parentNode;
                }
            }
        }

        const commands = {
            bold: {
                shortcut: "Ctrl+b",
                icon: "format_bold",
                toolbarHtml: "<strong title='Bold'>B</strong>",
                execCommand: "bold",
                active: tags.includes("b"),
            },
            italic: {
                shortcut: "Ctrl+i",
                toolbarHtml: "<em title='Italic'>I</em>",
                icon: "format_italic",
                execCommand: "italic",
                active: tags.includes("i"),
            },
            underline: {
                shortcut: "Ctrl+u",
                toolbarHtml: "<span title='Underscored' style='text-decoration: underline'>U</span>",
                icon: "format_underlined",
                execCommand: "underline",
                active: tags.includes("u"),
            },
            removeFormat: {
                shortcut: "Ctrl+m",
                execCommand: ["removeFormat", "unlink", "formatBlock"],
                execCommandValue: [null, null, ["<P>"]],
                toolbarHtml: "<span title='Remove format'>&#11034;</span>",
                icon: "format_clear",
            },
            createLink: {
                shortcut: "Ctrl+l",
                execCommandValue: function (callback) {
                    callback(prompt("Enter URL:", "https://"));
                },
                toolbarHtml: "<span title='Insert Link'>&#128279;</span>",
                icon: "add_link",
                //execCommand: "createLink",
                execCommand: () => {
                    const newLink = prompt("Write the URL here", "http://");
                    if (newLink && newLink != "" && newLink != "http://") {
                        this.execCommand("createlink", newLink);
                    }
                },
            },
            insertImage: {
                shortcut: "Ctrl+g",
                execCommand: "insertImage",
                execCommandValue: function (callback) {
                    callback(prompt("Enter image URL:", "http://"));
                },
                toolbarHtml: "<span title='Insert Image'>&#128444;</span>",
            },
            inserthorizontalrule: {
                shortcut: "Ctrl+Alt+h",
                execCommand: "inserthorizontalrule",
                toolbarHtml: "<span title='Insert horizontal rule'>&#9473;</span>",
            },
            strikethrough: {
                shortcut: "Ctrl+Alt+t",
                icon: "format_strikethrough",
                toolbarHtml: "<strike title='Strike-through'>S</strike>",
                execCommand: "strikethrough",
                active: tags.includes("strike"),
            },
            increaseFontSize: {
                shortcut: "Ctrl+Alt+=",
                execCommand: "increasefontsize",
                toolbarHtml: "<sup>&plus;</sup>",
            },
            decreaseFontSize: {
                shortcut: "Ctrl+Alt+m",
                execCommand: "decreasefontsize",
                toolbarHtml: "<sup>&minus;</sup>",
            }, // keyCode for - seems to be interpreted as M
            blockquote: {
                shortcut: "Ctrl+q",
                execCommandValue: ["<BLOCKQUOTE>"],
                toolbarHtml: "<span title='Quote'>&rdquor;</span>",//"&ldquo;&bdquo;",
                icon: "format_quote",
                execCommand: "formatblock",
                command_value: "blockquote",
            },
            code: {
                shortcut: "Ctrl+Alt+c",
                execCommand: "formatBlock",
                execCommandValue: ["<PRE>"],
                toolbarHtml: "<span title='Code'>{&nbsp;}</span>",
            },
            ol: {
                shortcut: "Ctrl+Alt+o",
                icon: "format_list_numbered",
                toolbarHtml: "<span title='Ordered List'>1.</span>",
                execCommand: "insertorderedlist",
                active: tags.includes("ol"),
            },
            ul: {
                shortcut: "Ctrl+Alt+u",
                icon: "format_list_bulleted",
                toolbarHtml: "<span title='Unordered List'>&bullet;</span>",
                execCommand: "insertunorderedlist",
                active: tags.includes("ul"),
            },
            sup: {
                shortcut: "Ctrl+.",
                execCommand: "superscript",
                toolbarHtml: "<span title='Superscript'>x<sup>2</sup></span>",
            },
            sub: {
                shortcut: "Ctrl+Shift+.",
                execCommand: "subscript",
                toolbarHtml: "<span title='Subscript'>x<sub>2</sub></span>"
            },
            p: {
                shortcut: "Ctrl+Alt+0",
                execCommand: "formatBlock",
                execCommandValue: ["<P>"],
                toolbarHtml: "<span title='Paragraph'>P</span>"
            },
            para: {
                icon: "title",
                execCommand: "formatBlock",
                values: [
                    {name: "Normal Text", value: "--"},
                    {name: "Heading 1", value: "h1"},
                    {name: "Heading 2", value: "h2"},
                    {name: "Heading 3", value: "h3"},
                    {name: "Heading 4", value: "h4"},
                    {name: "Heading 5", value: "h5"},
                    {name: "Heading 6", value: "h6"},
                    {name: "Paragraph", value: "p"},
                    {name: "Pre-Formatted", value: "pre"},
                ],
            },
            h1: {
                shortcut: "Ctrl+Alt+1",
                execCommand: "formatBlock",
                execCommandValue: ["<H1>"],
                toolbarHtml: "<span>H1</span>"
            },
            h2: {
                shortcut: "Ctrl+Alt+2",
                execCommand: "formatBlock",
                execCommandValue: ["<H2>"],
                toolbarHtml: "<span>H2</span>"
            },
            h3: {
                shortcut: "Ctrl+Alt+3",
                execCommand: "formatBlock",
                execCommandValue: ["<H3>"],
                toolbarHtml: "<span>H3</span>"
            },
            h4: {
                shortcut: "Ctrl+Alt+4",
                execCommand: "formatBlock",
                execCommandValue: ["<H4>"],
                toolbarHtml: "<span>H4</span>"
            },
            h5: {
                shortcut: "Ctrl+Alt+5",
                execCommand: "formatBlock",
                execCommandValue: ["<H5>"],
                toolbarHtml: "<span>H5</span>"
            },
            h6: {
                shortcut: "Ctrl+Alt+6",
                execCommand: "formatBlock",
                execCommandValue: ["<H6>"],
                toolbarHtml: "<span>H6</span>"
            },
            alignLeft: {
                shortcut: "Ctrl+Alt+l",
                toolbarHtml: "<span title='Align Left'>&#8612;</span>",
                icon: "format_align_left",
                execCommand: "justifyleft",
            },
            alignRight: {
                shortcut: "Ctrl+Alt+r",
                toolbarHtml: "<span title='Align Right'>&#8614;</span>",
                icon: "format_align_right",
                execCommand: "justifyright",
            },
            alignCenter: {
                shortcut: "Ctrl+Alt+c",
                toolbarHtml: "<span title='Align Center'>&#8633;</span>",
                icon: "format_align_right",
                execCommand: "justifycenter",
            },
            indent: {
                shortcut: "Tab",
                toolbarHtml: "<span title='Indent'>&#8677;</span>",//"&rArr;",

                icon: "format_indent_increase",
                execCommand: "indent",
            },
            outdent: {
                shortcut: ["Ctrl+Tab", "Shift+Tab"],
                toolbarHtml: "<span title='Decrease Indent'>&#8676;</span>",//"&lArr;",

                icon: "format_indent_decrease",
                execCommand: "outdent",
            }
        };

        return html`
            <div>
                ${this.renderCommands(commands)}
            </div>`;
    }

    renderCommands(commands) {
        const scopedThis = function () { console.debug(this); }
        const s = new Shortcut();
        let elements = [];
        for (const c in commands) {
            const n = commands[c];

            s.add(n.shortcut, scopedThis, { 'type': 'keydown', 'propagate': false });

            if (n.icon == "add_image") elements.push(this.renderImageUpload(n));
            else if (n.values) elements.push(this.renderSelect(n));
            else elements.push(this.renderButton(n));
        }
        return html`${elements.map(n => html`${n}`)}`
    }

    renderButton(n) {
        return html`
            <button class=${classMap({"active": n.active})}
                    @click=${() => {
                        if (n.values) {
                        } else if (typeof n.execCommand === "string") {
                            this.execCommand(n.execCommand, n.command_value);
                        } else {
                            n.execCommand();
                        }
                    }}>${unsafeHTML(n.toolbarHtml)}
            </button>`;
    }

    renderImageUpload(n) {
        return html`<input type=file multiple
                           @change="${(e) => {
                               document.dispatchEvent(
                                       new CustomEvent("image.upload", {
                                           trusted: true,
                                           bubbles: true,
                                           detail: e.target?.files,
                                       })
                               );
                           }}"
        >`;
    }

    renderSelect(n) {
        return html`
            <select id="${n.icon}"
                    @change=${(e) => {
                        const val = e.target.value;
                        if (val === "--") {
                            this.execCommand("removeFormat", undefined);
                        } else if (typeof n.execCommand === "string") {
                            this.execCommand(n.execCommand, val);
                        } else if (Array.isArray(n.execCommand)) {
                            for (const i in n.execCommand) {
                                this.execCommand(n.execCommand[i], val);
                            }
                        }
                    }}>
                ${n.values.map((v) => html`
                    <option value=${v.value}>${unsafeHTML(v.name)}</option>`)}
            </select>
        `;
    }

    execCommand(command, val) {
        // NOTE(marius): this should be probably be replaced with something
        // based on the ideas from here: https://stackoverflow.com/a/62266439
        document.execCommand(command, true, val);
    }
}
