import {css, html, LitElement, nothing} from "lit";
import {map} from "lit-html/directives/map.js";
import {when} from "lit-html/directives/when.js";

export class OniErrors extends LitElement {
    static styles = css``;
    static properties = {
        it: {type: Object},
    };

    constructor() {
        super();
    }

    renderErrorWithTrace(err) {
        return html`
            <details>
                <summary>${err.status ?? nothing} ${err.message}</summary>
                ${when(Array.isArray(err.trace), () => html`
                    ${map(err.trace, tr => html`<pre><code><strong>${tr.function}</strong>: ${tr.file}:${tr.line}</code></pre>`)}
                `)}
            </details>`
    }

    renderErrorWithoutTrace(err) {
        return html`<div>${err.status ?? nothing} ${err.message}</div>`
    }

    renderError(err) {
        return Array.isArray(err.trace) ? this.renderErrorWithTrace(err) : this.renderErrorWithoutTrace(err);

    }

    render() {
        if (!Array.isArray(this.it)) {
            this.it = [this.it];
        }
        return html`
            <main>${map(this.it, err => this.renderError(err))}</main>`;
    }
}
