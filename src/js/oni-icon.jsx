import {css, html, LitElement, nothing} from "lit";
import {unsafeSVG} from "lit-html/directives/unsafe-svg.js";

export class OniIcon extends LitElement {
    static styles = css`
    svg {
        max-width: 1em;
        max-height: 1.2em;
        fill: currentColor;
        color: currentColor;
        vertical-align: middle;
        padding: 0 var(--spacing-s);
    }
    svg[data-name=inbox], svg[data-name=outbox]  {
        margin-bottom: calc(.5 * var(--spacing-s));
    }
    svg[data-name=clock], svg[data-name=announce], svg[data-name=like], svg[data-name=dislike] {
        margin: calc(-.5 * var(--spacing-s)) calc(-1*var(--spacing-s)) 0 0;
    }
    svg[data-name=external-href] {
        margin: calc(-.5 * var(--spacing-s)) calc(-1*var(--spacing-s)) var(--spacing-s) 0;
    }
    svg[data-name=external-href], svg[data-name=bookmark] {
        margin: calc(-.5 * var(--spacing-s)) calc(-1*var(--spacing-s)) 0 0;
    }
    svg[data-name=following] {
        transform: rotateY(180deg);
    }
    `;
    static properties = {
        name: {type: String},
        alt: {type: String}
    };

    constructor() {
        super();
    }

    render() {
        if (!this.name) return nothing;
        return html`${unsafeSVG(`<svg aria-hidden="true" data-name="${this.name}"><use role="img" href="/icons.svg#icon-${this.name}"><title>${this.alt || this.name}</title></use></svg>`)}`
    }
}
