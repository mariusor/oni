import {html, LitElement} from "lit";

export class NaturalLanguageValue extends LitElement {
    static properties = { }

    constructor() {
        super();
    }

    render() {
        return html`<slot></slot>`;
    }
}
