import {css, html, LitElement, nothing} from "lit";
import {map} from "lit-html/directives/map.js";
import {when} from "lit-html/directives/when.js";

export class OniErrors extends LitElement {
    static styles = css`
        h2 {
            text-align: center;
        }
        details {
            font-size: .8em;
        }
        details[open] summary::before {
            content: "Collapse";
        }
        details summary::before {
            content: "Expand";
        }
        pre {
            margin: 0 auto;
        }
    `;
    static properties = {
        it: {type: Object},
    };

    constructor() {
        super();
    }

    renderErrorDetails(err) {
        return html`
            ${this.renderErrorTitle(err)}
            <details>
                <summary></summary>
                ${when(Array.isArray(err.trace), () => html`
                    ${map(err.trace, tr => html`<pre><code><strong>${tr.function}</strong>: ${tr.file}:${tr.line}</code></pre>`)}
                `)}
            </details>`
    }

    renderErrorTitle(err) {
        return html`<h2>${err.status ?? nothing} ${err.message}</h2>`
    }

    renderError(err) {
        return Array.isArray(err.trace) ? this.renderErrorDetails(err) : this.renderErrorTitle(err);
    }

    render() {
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        return html`
            <main>${map(this.it, err => this.renderError(err))}</main>`;
    }
}
