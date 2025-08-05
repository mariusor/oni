import {css, html, LitElement, nothing} from "lit";
import {unsafeSVG} from "lit-html/directives/unsafe-svg.js";

export class OniIcon extends LitElement {
    static styles = css`
    svg {
        max-width: 1em;
        max-height: 1.2em;
        fill: currentColor;
        vertical-align: middle;
        margin: 0 .2rem;
    }
    svg[data-name=outbox] {
        vertical-align: text-bottom;
    }
    svg[data-name=clock], svg[data-name=announce], svg[data-name=like], svg[data-name=dislike] {
        margin: -.1rem -.2rem 0 0;
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
