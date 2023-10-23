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
        :host([editable]:hover), :host([editable]:focus) {
          outline: dashed 2px var(--accent-color);
          outline-offset: 2px;
          padding-right: 2em;
        }
        :host([editable]) oni-icon[name=edit] svg {
          max-height: .7em;
          max-width: .7em;
        } 
        :host([editable]) oni-icon[name=edit] {
          display: none;
          color: var(--accent-color);
          position: absolute;
          top: -.2em;
          right: -.2em;
        }
        :host([editable]:hover) oni-icon[name=edit], 
        :host([editable]:focus) oni-icon[name=edit] {
          display: inline-block;
        }
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
    }

    _ditable = false;

    set ditable(status) {
        this._ditable = status;
    }

    get ditable() {
        return this._ditable;
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

    makeEditable (e) {
        e.stopPropagation();
        e.preventDefault();

        this.ditable = true;
        this.focus({"focusVisible": true})
        //alert(`${this.name} editable`);
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
                this.ditable || this.editable,
                () => html`<oni-text-editor
                            @blur="${this.checkChanged}"
                            ?contenteditable=${this.ditable || this.editable}
                    >
                        <slot>${unsafeHTML(this.value().trim()) ?? nothing}</slot>
                    </oni-text-editor>`,
                () => html`${unsafeHTML(this.value()) ?? nothing}`
            )}
            ${when(
                isAuthorized() && this.hasAttribute("editable"),
                    () => html`<oni-icon name="edit" @click=${this.makeEditable}></oni-icon>`,
                    () => nothing
            )}`;
    }
}
