import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {classMap} from "lit-html/directives/class-map.js";

export class TextEditor extends LitElement {
    static styles = [css`
    :host {
      --editor-width: 100%;
      --editor-height: 100vh;
      --editor-background: transparent;
      --editor-toolbar-height: 2rem;
      --editor-toolbar-background: transparent;
      --editor-toolbar-on-background: white;
      --editor-toolbar-on-active-background: #a4a4a4;
    }
    main {
      width: var(--editor-width);
      height: var(--editor-height);
      display: grid;
      grid-template-areas: "toolbar toolbar" "editor editor";
      grid-template-rows: var(--editor-toolbar-height) auto;
      grid-template-columns: auto auto;
    }
    :host div:first-of-type {
      grid-area: toolbar;
      width: var(--editor-width);
      height: var(--editor-toolbar-height);
      background-color: var(--editor-toolbar-background);
      color: var(--editor-toolbar-on-background);
      overscroll-behavior: contain;
      overflow-y: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
      border-bottom: 1px solid var(--editor-toolbar-on-background);
    }
    :host div:first-of-type::-webkit-scrollbar {
      display: none;
    }
    :host div:first-of-type > .active {
      color: var(--editor-toolbar-on-active-background);
    }
    select {
      margin-top: 5px;
      height: calc(var(--editor-toolbar-height) - 10px);
    }
    input[type="color"] {
      height: calc(var(--editor-toolbar-height) - 15px);
      -webkit-appearance: none;
      border: none;
      width: 22px;
    }
    input[type="color"]::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    input[type="color"]::-webkit-color-swatch {
      b
    mwc-icon-button {
      color: var(--editor-toolbar-on-background);
      --mdc-icon-size: 20px;
      --mdc-icon-button-size: 30px;
      cursor: pointer;
    }
    `];

    static properties = {
        root: {type: Element},
        content: {type: String},
    };

    constructor() {
        super();
    }

    async firstUpdated(props) {
        const elem = this.parentElement.querySelector("oni-text-editor slot");
        this.content = elem?.innerHTML ?? "";
        this.reset();
    }

    // connectedCallback() {
    //     super.connectedCallback();
    //     document.addEventListener('selectionchange', this.requestUpdate);
    // }
    //
    // disconnectedCallback() {
    //     document.removeEventListener('selectionchange', this.requestUpdate);
    //     super.disconnectedCallback();
    // }

    reset() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.content, "text/html");
        document.execCommand("defaultParagraphSeparator", false, "br");
        document.addEventListener("selectionchange", this.requestUpdate);
        const root = doc.querySelector("body");
        root.setAttribute("contenteditable", "");

        this.root = root;
    }

    handleDrop(e) {
        e.stopPropagation();
        e.preventDefault();

        this.handleFiles(e.dataTransfer.files);
    }

    handleDragOver(e) {
        e.stopPropagation();
        e.preventDefault();

        // Explicitly show this is a copy. (Why?)
        e.dataTransfer.dropEffect = 'copy';

        this.handleFiles(e.dataTransfer.files);
    }

    handleFiles(files) {
        if (!files) {
            return;
        }
        for (let i = 0, f; f = files[i]; i++) {
            if (!f.type.match('image.*')) {
                console.warn(`Files of type ${f.type} are not supported for upload.`);
                continue;
            }
            console.debug(f);

            const reader = new FileReader();
            reader.addEventListener("load", (theFile) => {
                     const img = document.createElement("img");
                     img.src = reader.result.toString();
                     img.title = theFile.name;
                     img.dataSize = theFile.size;
                     img.dataName = theFile.name;

                     console.debug(img);
                     this.root.appendChild(img);
                    // if (selection.rangeCount > 0 && selection.getRangeAt(0).startContainer != $('body').get(0)) {
                    //     const range = selection.getRangeAt(0);
                    //     const fragment = document.createDocumentFragment();
                    //     fragment.appendChild(img);
                    //
                    //     range.deleteContents();
                    //     range.insertNode(fragment);
                    // } else {
                    //     const elem = $(evt.target);
                    //     elem.append(img);
                    // }
            });

            reader.readAsDataURL(f);
        }
    }

    renderToolbar() {
        const selection = this.shadowRoot?.getSelection ? this.shadowRoot.getSelection() : null;
        const tags = [];
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
                    { name: "Normal Text", value: "--" },
                    { name: "Heading 1", value: "h1" },
                    { name: "Heading 2", value: "h2" },
                    { name: "Heading 3", value: "h3" },
                    { name: "Heading 4", value: "h4" },
                    { name: "Heading 5", value: "h5" },
                    { name: "Heading 6", value: "h6" },
                    { name: "Paragraph", value: "p" },
                    { name: "Pre-Formatted", value: "pre" },
                ],
            },
            {
                icon: "format_clear",
                text: "<span>&#10799;</span>",
                command: "removeFormat",
            },
            {
                icon: "format_bold",
                text: "<strong>B</strong>",
                command: "bold",
                active: tags.includes("b"),
            },
            {
                icon: "format_italic",
                text: "<em>I</em>",
                command: "emphasize",
                active: tags.includes("i"),
            },
            {
                icon: "format_underlined",
                text: "<span style='text-decoration: underline'>U</span>",
                command: "underline",
                active: tags.includes("u"),
            },
            {
                icon: "format_strikethrough",
                text: "<strike>S</strike>",
                command: "strikethrough",
                active: tags.includes("strike"),
            },
            {
                icon: "format_align_left",
                text: "<span>&#8612;</span>",
                command: "justifyleft",
            },
            {
                icon: "format_align_center",
                text: "<span>&#8633;</span>",
                command: "justifycenter",
            },
            {
                icon: "format_align_right",
                text: "<span>&#8614;</span>",
                command: "justifyright",
            },
            {
                icon: "format_list_numbered",
                text: "<span>1.</span>",
                command: "insertorderedlist",
                active: tags.includes("ol"),
            },
            {
                icon: "format_list_bulleted",
                text: "<span>&bullet;</span>",
                command: "insertunorderedlist",
                active: tags.includes("ul"),
            },
            {
                icon: "format_quote",
                text: "<span>&rdquor;</span>",
                command: "formatblock",
                command_value: "blockquote",
            },
            {
                icon: "format_indent_decrease",
                text: "<span>&#8676;</span>",
                command: "outdent",
            },
            {
                icon: "format_indent_increase",
                text: "<span>&#8677;</span>",
                command: "indent",
            },
            {
                icon: "add_link",
                text: "<span>&#128279;</span>",
                command: () => {
                    const newLink = prompt("Write the URL here", "http://");
                    if (newLink && newLink != "" && newLink != "http://") {
                        this.command("createlink", newLink);
                    }
                },
            },
            {
                icon: "link_off",
                text: "<strike>&#128279;</strike>",
                command: "unlink"
            },
            {
                icon: "add_image",
                text: "<span>&#128443;</span>",
                command: () => {

                },
            },
        ];
        return html`${commands.map((n) => {
            if (n.icon == "add_image") return this.renderImageUpload(n);
            if (n.values) return this.renderSelect(n);
            return this.renderButton(n)
        })}`;
    }

    renderButton(n) {
        return html`<button class=${classMap({"active": n.active})}
                @click=${() => {
                    if (n.values) {
                    } else if (typeof n.command === "string") {
                        this.command(n.command, n.command_value);
                    } else {
                        n.command();
                    }
        }}>${unsafeHTML(n.text)}</button>`;
    }

    renderImageUpload(n) {
        return html`<input type=file multiple @change=${(e) => this.handleFiles(e.target?.files)}>`;
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
                ${n.values.map((v) => html` <option value=${v.value}>${v.name}</option>`)}
            </select>
       `;
    }

    command(command, val) {
        // NOTE(marius): this should be probably be replaced with something
        // based on the ideas from here: https://stackoverflow.com/a/62266439
        document.execCommand(command, false, val);
    }

    render() {
        return html`<main>
            <div>${this.renderToolbar()}</div>
            <div 
                @dragover="${this.handleDragOver}"
                @drop="${this.handleDrop}"
            >${this.root}</div>
        </main>`;
    }
}
