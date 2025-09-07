import {css, html, LitElement, nothing} from "lit";

export class BandCampEmbed extends LitElement {
    static styles = [css`
        iframe {
            border: none; 
            width: 380px;
            height: 42px;
        }
    `]

    static properties = {
        url: {type: String},
        albumId: {type: Number},
        src: {type: String},
        show: {type: Boolean},
    }

    constructor() {
        super();
        this.show = false;
        this.albumId = -1;
    }

    render() {
        if (!this.show || this.src === "") {
            return nothing;
        }
        if (!this.src) {
            this.src = this.url;
        }

        const bgColor = window.getComputedStyle(this).getPropertyValue('--bg-color').replaceAll('#', '');
        const linkColor = window.getComputedStyle(this).getPropertyValue('--link-color').replaceAll('#', '');
        if (this.albumId < 0) {
            // NOTE(marius): we try to change the src to use our custom css colors for background and link colors
            this.src = this.src.replaceAll('bgcol=ffffff', `bgcol=${bgColor}`);
            this.src = this.src.replaceAll('linkcol=0687f5', `linkcol=${linkColor}`);
            this.src = this.src + 'artwork=none/width=380/';
        } else {
            this.src = `https://bandcamp.com/EmbeddedPlayer/album=${this.albumId}/size=small/bgcol=${bgColor}/linkcol=${linkColor}/transparent=true/artwork=none/width=380/`;
        }
        return html`<iframe
                src="${this.src}"
                seamless>
            <slot></slot>
        </iframe>`
    }
}
