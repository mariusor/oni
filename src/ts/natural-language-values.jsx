import {html, LitElement} from "lit";

export class NaturalLanguageValues extends LitElement {
    static properties = {}

    constructor() {
        super();
    }

    render() {
        return html`<slot></slot>`;
    }
}
