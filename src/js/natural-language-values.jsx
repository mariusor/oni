import {css, html, LitElement, nothing} from "lit";
import {editableContent, isAuthorized} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        :host {
          display: inline-block;
          position: relative;
        }
        :host([contenteditable]:hover), :host([contenteditable]:focus) {
          outline: dashed 2px var(--accent-color);
          outline-offset: 2px;
          padding-right: 2em;
        }
        :host([contenteditable]) oni-icon[name=edit] svg {
          max-height: .7em;
          max-width: .7em;
        } 
        :host([contenteditable]) oni-icon[name=edit] {
          display: none;
          color: var(--accent-color);
          position: absolute;
          top: -.2em;
          right: -.2em;
        }
        :host([contenteditable]:hover) oni-icon[name=edit], 
        :host([contenteditable]:focus) oni-icon[name=edit] {
          display: inline-block;
        }
        :host div { display: inline-block; }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
        name: {type: String},
        contentEditable: {type: Boolean},
    };

    constructor() {
        super();
        this.it = '';
        this.name = '';
    }

    set editable(status) {
        if (status) {
            this.setAttribute("contenteditable", "on");
        } else {
            this.removeAttribute("contenteditable");
        }
    }

    get editable() {
        return this.hasAttribute("contenteditable");
    }

    checkChanged(e) {
        if (!this.editable || this.name.length === 0) {
            console.warn('Unable to save, current settings are read-only');
            return;
        }

        const old = this.value();
        const content = editableContent(e.target);

        if (content === old.trim()) {
            console.debug(`No change for "${this.name}"`);
            return;
        }

        if (this.parentNode.nodeName.toLowerCase() == "a") {
            this.parentNode.removeEventListener('click', noClick);
        }
        this.dispatchEvent(new CustomEvent('content.change', {
            detail: {name: this.name, content: content},
            bubbles: true,
            composed: true,
        }));
    }

    makeEditable (e) {
        e.stopPropagation();
        e.preventDefault();

        this.editable = true;
        if (this.parentNode.nodeName.toLowerCase() == "a") {
            this.parentNode.addEventListener('click', noClick);
        }
        this.focus();
    }

    value() {
        let value;
        if (typeof this.it == 'string') {
            return this.it;
        }
        if (typeof this.it == 'object') {
            value = this.it.toString();
            if (this.it.hasOwnProperty(this.lang)) {
                value = this.it.getProperty(this.lang);
            }
        }
        return value;
    }

    render() {
        if (!this.it) { return nothing; }

        return html`
            ${when(
                this.editable,
                () => html`<oni-text-editor
                            @blur="${this.checkChanged}"
                            ?contenteditable=${this.editable}
                    >
                        <slot>${unsafeHTML(this.value().trim()) ?? nothing}</slot>
                    </oni-text-editor>`,
                () => html`${unsafeHTML(this.value()) ?? nothing}`
            )}
            ${when(
                this.editable,
                    () => html`<oni-icon name="edit" @click=${this.makeEditable}></oni-icon>`,
                    () => nothing
            )}`;
    }
}

const noClick = (e) => e.preventDefault()
