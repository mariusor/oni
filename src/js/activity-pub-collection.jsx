import {css, html, nothing} from "lit";
import {ActivityPubObject, ObjectTypes} from "./activity-pub-object";
import {ifDefined} from "lit-html/directives/if-defined.js";
import {ActivityTypes} from "./activity-pub-activity";
import {ActorTypes} from "./activity-pub-actor";
import {unsafeHTML} from "lit-html/directives/unsafe-html.js";

export class ActivityPubCollection extends ActivityPubObject {
    static styles = css`
        :host { width: 100%; }
        :host ul, :host ol { 
            width: 100%; 
            padding: 0; 
            margin: 0; 
            list-style: none;
        }
        :host li { 
            margin: 1rem 0;
            overflow: hidden;
            border-bottom: 1px solid var(--fg-color);
        }
    `;

    static properties = {
        it: {type: Object},
    }

    constructor() {
        super();
    }

    renderNext() {
        if (this.it.hasOwnProperty("next")) {
            return html`<a href=${this.it.next}>Next</a>`;
        }
        return nothing;
    }

    renderPrev() {
        if (this.it.hasOwnProperty("prev")) {
            return html`<a href=${this.it.prev}>Prev</a>`;
        }
        return nothing;
    }

    renderPrevNext() {
        const prev = this.renderPrev();
        const next = this.renderNext();
        if (prev == nothing && next == nothing) {
            return nothing;
        }
        return html`
            <nav>
                <ul> ${ifDefined(prev)} ${ifDefined(next)}</ul>
            </nav>`;
    }

    items() {
        let items = [];
        if (this.it === null) {
            return items;
        }
        if (this.type().toLowerCase().includes('ordered') && this.it.hasOwnProperty('orderedItems')) {
            items = this.it.orderedItems;
        } else if (this.it.hasOwnProperty('items')) {
            items = this.it.items;
        }
        return items.sort(sortByPublished);
    }

    renderItems() {
        return html`${this.items().map(it => {
            const type = it.hasOwnProperty('type')? it.type : 'unknown';
            console.debug(it);
            let renderedItem = unsafeHTML(`<!-- Unknown activity object ${type} -->`);
            if (ActivityTypes.indexOf(type) >= 0) {
                renderedItem = html`<oni-activity it=${JSON.stringify(it)}></oni-activity>`;
            }
            if (ActorTypes.indexOf(type) >= 0) {
                renderedItem = html`<oni-actor it=${JSON.stringify(it)} simplified=true></oni-actor>`
            }
            if (ObjectTypes.indexOf(type) >= 0) {
                renderedItem = ActivityPubObject.renderByType(it);
            }

            return html` <li>${renderedItem}</li>`
        })}`
    }

    render() {
        const collection = () => {
            if (this.items().length == 0) {
                return html`
                    <div class="content">Nothing to see here, please move along.</div>`;
            }

            const list = this.type().toLowerCase().includes('ordered')
                ? html`
                        <ol>${this.renderItems()}</ol>`
                : html`
                        <ul>${this.renderItems()}</ul>`;

            return html`
                <div class="content">
                    ${list}
                    ${this.renderPrevNext()}
                </div>`;
        }
        return html`${collection()}`;
    }
}

const sortByPublished = function (a, b) {
    const aHas = a.hasOwnProperty('published');
    const bHas = b.hasOwnProperty('published');
    if (!aHas && !bHas) {
        return (a.id <= b.id) ? 1 : -1;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return Date.parse(b.published) - Date.parse(a.published);
}
