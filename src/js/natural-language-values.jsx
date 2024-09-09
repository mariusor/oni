import {css, html, LitElement, nothing} from "lit";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubObject} from "./activity-pub-object";

export class NaturalLanguageValues extends LitElement {
    static styles = [css`
        :host {
          display: inline-block;
          position: relative;
        }
        :host div { display: inline-block; }
        :host([name=summary]) p, :host([name=name]) p, :host([name=preferredUsername]) p {
            display: inline-block; 
            margin: 0;
        }
    `, ActivityPubObject.styles];

    static properties = {
        it: {type: Object},
        name: {type: String},
    };

    constructor() {
        super();
        this.it = '';
        this.name = '';
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
        return html`${unsafeHTML(this.value()) ?? nothing}`;
    }
}
