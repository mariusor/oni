import {css, html, LitElement} from "lit";
import {classMap} from "lit-html/directives/class-map.js";

export class CollectionLinks extends LitElement {
    static styles = css`
        :host {
            display: flex;
            width: 100%;
            justify-content: flex-end;
            border-bottom: 3px inset var(--fg-color);
            margin-right: 1rem;
            margin-bottom: 0;
        }
        :host ul {
            margin: 0 .8rem 0;
            padding: 0;
        }
        :host li {
            min-width: 8vw;
            text-align: center;
            /*line-height: 2.4rem;*/
            list-style: none;
            display: inline-block;
            padding: .4rem .8rem .4rem 0;
        }
        :host li.active {
            border: 1px solid var(--fg-color);
            border-bottom: 0;
        }
    `
    static properties = {
        it: {type: Object}
    }

    constructor() {
        super();
        this.it = {};
    }

    render() {
        return html`
            <nav>
                <ul>
                    <slot></slot>
                    ${this.it.map(value => html`
                        <li class=${classMap({'active': (value === window.location.href)})}>
                            <oni-collection-link it=${value}></oni-collection-link>
                        </li>`
                    )}
                </ul>
            </nav>`;
    }
}
