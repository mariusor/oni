import {css, html, LitElement, nothing} from "lit";
import {map} from "lit-html/directives/map.js";
import {when} from "lit-html/directives/when.js";

export class OniErrors extends LitElement {
    static styles = css`
        h2 {
            text-align: center;
        }
        details {
            font-size: .9rem;
        }
        details[open] summary::before {
            content: "Hide";
        }
        details summary::before {
            content: "Show";
        }
        pre {
            margin: 0 auto;
        }
    `;
    static properties = {
        it: {type: Object},
        inline: {type: Boolean},
    };

    constructor() {
        super();

        const json = (this.renderRoot?.querySelector('script') || this.querySelector('script'))?.text;
        if (json) {
            this.it = JSON.parse(json);
        }
    }

    renderErrorTrace(err) {
        if (!err || !err.hasOwnProperty('trace')) return nothing;
        if (this.inline) return nothing;
        if (!Array.isArray(err.trace)) {
            err.trace = [err.trace];
        }

        return html `<details><summary></summary>
            ${when(Array.isArray(err.trace), () => html`
                    ${map(err.trace, tr => html`<pre><code><strong>${tr.function}</strong>: ${tr.file}:${tr.line}</code></pre>`)}
                `)}
        </details>`;
    }

    renderErrorTitle(err) {
        if (this.inline) return html`${err.status ?? nothing} ${err.message}`;
        return html`<h2>${err.status ?? nothing} ${err.message}</h2>`
    }

    renderError(err) {
        return html`${this.renderErrorTitle(err)}${this.renderErrorTrace(err)}`
    }

    render() {
        if (!this.it) return nothing;
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        // NOTE(marius): filter out if another error has the same message but index is lower
        this.it = this.it.filter(
            (el, i) => !(typeof this.it.find((elem, index) => elem?.message === el?.message && index < i) === 'object')
        );
        return html`<main>${map(this.it, err => this.renderError(err))}</main>`;
    }
}
