import {html, LitElement, nothing} from "lit";
import {isAuthenticated} from "./utils";
import {when} from "lit-html/directives/when.js";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class NaturalLanguageValues extends LitElement {
    static properties = {
        it: {type: String},
        name: {type: String},
        editable: {type: Boolean}
    };

    constructor() {
        super();
        this.it = "";
        this.name = "";
        this.editable = false;
        this.addEventListener('blur', this.checkValue)
    }

    checkValue(e) {
        if (!this.editable || this.name.length == 0) {
            console.warn('Unable to save, current settings are read-only');
            return;
        }

        let root = e.target;
        if (root.innerHTML.length == 0) {
            // Nothing slotted, load content from the shadow DOM.
            root = e.target.shadowRoot.querySelector('div[contenteditable]');
            root.childNodes.forEach(node => {
                if (node.nodeName.toLowerCase() === 'slot') {
                    // the slot should be removed if empty, otherwise it overwrites the value
                    root.removeChild(node);
                }
                if (node.nodeType === 8) {
                    // Lit introduced comments
                    root.removeChild(node);
                }
            });
        } else {
            root = e.target.shadowRoot.querySelector('div[contenteditable]');
        }

        const content = root.innerHTML.trim();
        if (content === this.it.trim()) {
            console.debug(`no change for ${this.name}`)
            return;
        }
        this.dispatchEvent(new CustomEvent('content.changed', {
            detail: {name: this.name},
            bubbles: true,
        }));
    }

    render() {
        this.editable = isAuthenticated();
        return html`
            <div ?contenteditable=${this.editable}
                 ${when(this.editable,
                         () => html`@change="${this.checkValue}"`,
                         () => nothing
                 )}>
                ${unsafeHTML(this.it) ?? nothing}
                <slot ?contenteditable="${this.editable}"></slot>
            </div>`;
    }
}
