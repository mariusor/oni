import {css, html, LitElement} from "lit";

export class CollectionLink extends LitElement {
    static styles = css` :host { text-transform: capitalize; } `;

    static properties = {
        it: {type: String},
    }

    constructor() {
        super();
    }

    label() {
        const pieces = this.it.split('/');
        return pieces[pieces.length -1];
    }

    render() {
        return html`<oni-icon name=${this.label()}></oni-icon><a href="${this.it}">${this.label()}</a>`;
    }
}
