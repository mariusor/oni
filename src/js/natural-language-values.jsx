import {css, html, LitElement, nothing} from "lit";
import {editableContent, isAuthenticated} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class NaturalLanguageValues extends LitElement {
    static styles = css`
        :host { display: inline-block; }
    `;

    static properties = {
        it: {type: String},
        name: {type: String},
        editable: {type: Boolean}
    };

    constructor() {
        super();
        this.it = '';
        this.name = '';
        this.editable = false;
    }

    checkChanged(e) {
        if (!this.editable || this.name.length == 0) {
            console.warn('Unable to save, current settings are read-only');
            return;
        }

        const content = editableContent(e.target);
        if (content === this.it.trim()) {
            console.debug(`no change for ${this.name}`)
            return;
        }
        this.dispatchEvent(new CustomEvent('content.change', {
            detail: {name: this.name, content: content},
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        this.editable = isAuthenticated();
        return html`
            <div ?contenteditable=${this.editable} @blur="${this.checkChanged}">
                ${unsafeHTML(this.it) ?? nothing}
                <slot></slot>
            </div>`;
    }
}
