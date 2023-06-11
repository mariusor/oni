import {css, html, LitElement, nothing} from "lit";
import {editableContent} from "./utils";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";
import {when} from "lit-html/directives/when.js";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        :host { display: inline-block; }
        :host div { display: inline-block; }
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
        this.active = false;
    }

    checkChanged(e) {
        if (!this.editable || this.name.length === 0) {
            console.warn('Unable to save, current settings are read-only');
            return;
        }

        const old = this.value();
        const content = editableContent(e.target);

        if (content === old.trim()) {
            console.debug(`no change for "${this.name}"`)
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
            ${when(this.editable,
                    () => html`<oni-text-editor
                            @blur="${this.checkChanged}"
                            ?contenteditable=${this.editable}
                    >
                        <slot>${unsafeHTML(this.value()) ?? nothing}</slot>
                    </oni-text-editor>`,
                    () => html`${unsafeHTML(this.value()) ?? nothing}`
            )}
            `;
    }
}
