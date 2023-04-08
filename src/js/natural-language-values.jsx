import {css, html, LitElement, nothing} from "lit";
import {editableContent, isAuthorized} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        :host { display: inline-block; }
        :host div { display: inline-block; }
        :host::before { margin-right: -.4rem; }
        :host p { line-height: 1.8em; }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
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
        if (!this.editable || this.name.length === 0) {
            console.warn('Unable to save, current settings are read-only');
            return;
        }

        const old = this.value();
        const content = editableContent(e.target);

        if (content === old.trim()) {
            console.debug(`no change for ${this.name}`)
            return;
        }
        this.dispatchEvent(new CustomEvent('content.change', {
            detail: {name: this.name, content: content},
            bubbles: true,
            composed: true,
        }));
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
            <div ?contenteditable=${this.editable} @blur="${this.checkChanged}">
                ${unsafeHTML(this.value()) ?? nothing}
                <slot></slot>
            </div>`;
    }
}
