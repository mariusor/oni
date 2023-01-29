import {css, html, LitElement} from "lit";

export class CollectionLink extends LitElement {
    static styles = css`
        a {
            color: var(--link-color); 
        }
        a:visited {
            color: var(--linkvisited-color); 
        }
        a:active {
            color: var(--linkactive-color); 
        }
    `;
    static properties = {
        iri: {type: String},
    }

    constructor() {
        super();
    }

    label(iri) {
        const pieces = iri.split("/");
        const label = pieces[pieces.length -1];
        return `${label.substring(0,1).toUpperCase()}${label.substring(1)}`
    }

    render() {
        return html`<a href="${this.iri}">${this.label(this.iri)}</a>`;
    }
}
