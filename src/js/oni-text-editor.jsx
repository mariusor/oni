import {css, html, LitElement} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";
import {showError} from "./utils";

export class TextEditor extends LitElement {
    static styles = [css`
        :host {
          --editor-width: 100%;
          --editor-height: 100vh;
          --editor-background: transparent;
          --editor-toolbar-height: 2rem;
        }
        main {
          width: var(--editor-width);
          height: var(--editor-height);
          display: grid;
          grid-template-areas: "toolbar toolbar" "editor editor";
          grid-template-rows: var(--editor-toolbar-height) auto;
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
                >${this.root}</div>
            </main>`;
    }
}

export class TextEditorToolbar extends LitElement {
    static styles = [css`
    :host {
      --toolbar-width: max-content;
      --toolbar-height: 100%;
      --toolbar-background-top: white;
      --toolbar-background-bottom: silver;
      --toolbar-on-background: white;
      --toolbar-on-active-background: #a4a4a4;
    }
    :host {
      height: var(--toolbar-height);
      width: var(--toolbar-width);
      overscroll-behavior: contain;
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

        const commands = [
            {
                icon: "title",
                command: "formatBlock",
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
            {
                icon: "format_clear",
                text: "<span title='Remove format'>&#11034;</span>",
                command: "removeFormat",
            },
            {
                icon: "format_bold",
                text: "<strong title='Bold'>B</strong>",
                command: "bold",
                active: tags.includes("b"),
            },
            {
                icon: "format_italic",
                text: "<em title='Italic'>I</em>",
                command: "italic",
                active: tags.includes("i"),
            },
            {
                icon: "format_underlined",
                text: "<span title='Underscored' style='text-decoration: underline'>U</span>",
                command: "underline",
                active: tags.includes("u"),
            },
            {
                icon: "format_strikethrough",
                text: "<strike title='Strike-through'>S</strike>",
                command: "strikethrough",
                active: tags.includes("strike"),
            },
            {
                icon: "format_align_left",
                text: "<span title='Align Left'>&#8612;</span>",
                command: "justifyleft",
            },
            {
                icon: "format_align_center",
                text: "<span title='Align Center'>&#8633;</span>",
                command: "justifycenter",
            },
            {
                icon: "format_align_right",
                text: "<span title='Align Right'>&#8614;</span>",
                command: "justifyright",
            },
            {
                icon: "format_list_numbered",
                text: "<span title='Ordered List'>1.</span>",
                command: "insertorderedlist",
                active: tags.includes("ol"),
            },
            {
                icon: "format_list_bulleted",
                text: "<span title='Unordered List'>&bullet;</span>",
                command: "insertunorderedlist",
                active: tags.includes("ul"),
            },
            {
                icon: "format_quote",
                text: "<span title='Quote'>&rdquor;</span>",
                command: "formatblock",
                command_value: "blockquote",
            },
            {
                icon: "format_indent_decrease",
                text: "<span title='Decrease Indent'>&#8676;</span>",
                command: "outdent",
            },
            {
                icon: "format_indent_increase",
                text: "<span title='Indent'>&#8677;</span>",
                command: "indent",
            },
            {
                icon: "add_link",
                text: "<span title='Insert Link'>&#128279;</span>",
                command: () => {
                    const newLink = prompt("Write the URL here", "http://");
                    if (newLink && newLink != "" && newLink != "http://") {
                        this.command("createlink", newLink);
                    }
                },
            },
            {
                icon: "link_off",
                text: "<strike title='Remove Link'>&#128279;</strike>",
                command: "unlink"
            },
            {
                icon: "add_image",
                text: "<span title='Add image'>&#128443;</span>",
                command: () => {
                    // TODO
                },
            },
        ];

        return html`
            <div>${commands.map((n) => {
                if (n.icon == "add_image") return this.renderImageUpload(n);
                if (n.values) return this.renderSelect(n);
                return this.renderButton(n)
            })}
            </div>`;
    }

    renderButton(n) {
        return html`
            <button class=${classMap({"active": n.active})}
                    @click=${() => {
                        if (n.values) {
                        } else if (typeof n.command === "string") {
                            this.command(n.command, n.command_value);
                        } else {
                            n.command();
                        }
                    }}>${unsafeHTML(n.text)}
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
                            this.command("removeFormat", undefined);
                        } else if (typeof n.command === "string") {
                            this.command(n.command, val);
                        }
                    }}>
                ${n.values.map((v) => html`
                    <option value=${v.value}>${unsafeHTML(v.name)}</option>`)}
            </select>
        `;
    }

    command(command, val) {
        // NOTE(marius): this should be probably be replaced with something
        // based on the ideas from here: https://stackoverflow.com/a/62266439
        document.execCommand(command, true, val);
    }
}
