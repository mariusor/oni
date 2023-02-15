import {css, html, LitElement, nothing} from "lit";
import {unsafeSVG} from "lit-html/directives/unsafe-svg.js";

export class Icon extends LitElement {
    static styles = css`svg { max-width: 1em; max-height: 1.2em; fill: currentColor; vertical-align: text-bottom; }`;
    static properties = {name: {type: String}};

    constructor() {
        super();
    }

    render() {
        if (!this.name) return nothing;
        return html`${unsafeSVG(`<svg aria-hidden="true" name="icon-${this.name}"><use xlink:href="/icons.svg#icon-${this.name}"><title>${this.name}</title></use></svg><slot></slot>`)}`
    }
}
