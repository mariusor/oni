import {css, html, nothing} from "lit";
import {ActivityPubObject} from "./activity-pub-object";
import {ifDefined} from "lit-html/directives/if-defined.js";
import {ActivityPubItem, ActivityTypes, ActorTypes} from "./activity-pub-item";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";
import {ActivityPubActivity} from "./activity-pub-activity";
import {until} from "lit-html/directives/until.js";

export class ActivityPubCollection extends ActivityPubObject {
    static styles = [css`
        :host ul, :host ol {
            padding: 0;
            margin: 0;
            list-style: none;
        }
        :host li {
            overflow: hidden;
            border-bottom: 1px solid var(--fg-color);
        }
    `, ActivityPubObject.styles];

    static properties = ActivityPubObject.properties;

    constructor() {
        super();
    }

    renderNext() {
        if (this.it.hasOwnProperty("next")) {
            return html`<a href=${this.it.getNext()}>Next</a>`;
        }
        return nothing;
    }

    renderPrev() {
        if (this.it.hasOwnProperty("prev")) {
            return html`<a href=${this.it.getPrev()}>Prev</a>`;
        }
        return nothing;
    }

    renderPrevNext() {
        const prev = this.renderPrev();
        const next = this.renderNext();
        if (prev === nothing && next === nothing) {
            return nothing;
        }
        return html`
            <nav>
                <ul> ${ifDefined(prev)} ${ifDefined(next)}</ul>
            </nav>`;
    }

    renderItems() {
        return html`${this.it.getItems().map(it => {
            const type = it.hasOwnProperty('type')? it.type : 'unknown';

            let renderedItem = unsafeHTML(`<!-- Unknown activity object ${type} -->`);
            if (ActivityTypes.indexOf(type) >= 0) {
                if (!ActivityPubActivity.isValid(it)) return nothing;

                renderedItem = html`<oni-activity it=${JSON.stringify(it)}></oni-activity>`;
            } else if (ActorTypes.indexOf(type) >= 0) {
                renderedItem = html`<oni-actor it=${JSON.stringify(it)} ?inline=${true}></oni-actor>`
            } else {
                if (!ActivityPubObject.isValid(it)) return nothing;

                renderedItem = ActivityPubObject.renderByType(it);
            }

            return html` <li>${until(renderedItem)}</li>`
        })}`
    }

    render() {
        if (!ActivityPubItem.isValid(this.it)) return nothing;

        const collection = () => {
            if (this.it.getItems().length === 0) {
                return nothing;
            }

            const list = this.it.type.toLowerCase().includes('ordered')
                ? html`
                        <ol>${this.renderItems()}</ol>`
                : html`
                        <ul>${this.renderItems()}</ul>`;

            return html`
                    ${list}
                    ${this.renderPrevNext()}
                `;
        }
        return html`${collection()}`;
    }
}
