import {css, html, nothing} from "lit";
import {OniIcon} from "./oni-icon";
import {unsafeSVG} from "lit-html/directives/unsafe-svg.js";

export class OniThrobber extends OniIcon {
    static styles = [css`
        :host { 
            display: inline-block; 
            min-width: 1rem;
        }
        svg {
          animation: rotate 2s linear infinite;
          vertical-align: text-bottom;
          height: 1rem;
          width: 1rem;
        }
        svg circle {
            stroke: currentColor;
            stroke-linecap: round;
            animation: dash 1.5s ease-in-out infinite;
        }
        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes dash {
          0% {
            stroke-dasharray: 1, 150;
            stroke-dashoffset: 0;
          }
          50% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -35;
          }
          100% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -124;
          }
        }
    `];

    constructor() {
        super();
    }

    render() {
        if (!this.name) return nothing;
        return html`
            ${unsafeSVG(`<svg aria-hidden="true" data-name=${this.name} viewBox="0 0 50 50">
            <title>${this.alt || this.name}</title>
            <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>`)}`
    }

    static throbber = (name) => html`
        <oni-throbber .name=${name} .alt="Loading ${name}"></oni-throbber>`;
}

