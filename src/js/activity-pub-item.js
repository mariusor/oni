
export const ObjectTypes = ['Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document', 'Tombstone', 'Event', 'Mention', ''];
export const ActorTypes = ['Person', 'Group', 'Application', 'Service'];
export const ActivityTypes = [ 'Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore' ];
export const CollectionTypes = [ 'Collection', 'CollectionPage', 'OrderedCollection', 'OrderedCollectionPage'];

//const itemProperties = ['icon', 'image', 'actor', 'attachment', 'audience', 'attributedTo', 'context', 'generator', 'inReplyTo', 'location', 'preview', 'target', 'result', 'origin', 'instrument', 'object'];

const objectProperties = ['id', 'type', 'icon', 'image', 'summary', 'name', 'content', 'attachment', 'audience', 'attributedTo', 'context', 'mediaType', 'endTime', 'generator', 'inReplyTo', 'location', 'preview', 'published', 'updated', 'startTime', 'tag', 'to', 'bto', 'cc', 'bcc', 'duration', 'source', 'url', 'replies', 'likes', 'shares'];
const actorProperties = ['preferredUsername', 'publicKey', 'endpoints', 'streams', 'inbox', 'outbox', 'liked', 'shared', 'followers', 'following'];
const activityProperties = ['actor', 'target', 'result', 'origin', 'instrument', 'object'];
const collectionProperties = ['items', 'orderedItems', 'totalItems', 'first', 'last', 'current', 'partOf', 'next', 'prev'];

export class ActivityPubItem {
    id = '';
    type = '';

    constructor(it) {
        if (typeof it === 'string') {
            this.id = it;
            return;
        }
        const setPropIfExists = (p) => {
            if (!it.hasOwnProperty(p)) return;

            // if (itemProperties.indexOf(p) <= 0) {
                this[p] = it[p];
            // } else {
            //     this[p] = new ActivityPubItem(it[p]);
            // }
        };
        objectProperties.forEach(setPropIfExists);
        if (ActorTypes.indexOf(this.type) >= 0) {
            actorProperties.forEach(setPropIfExists);
        }
        if (ActivityTypes.indexOf(this.type) >= 0) {
            activityProperties.forEach(setPropIfExists);
        }
        if (CollectionTypes.indexOf(this.type) >= 0) {
            collectionProperties.forEach(setPropIfExists);
        }
        return this;
    }

    iri() {
        return this.id;
    }

    getUrl() {
        if (!this.hasOwnProperty('url')) {
            this.url = null;
        }
        return this.url;
    }

    getAttachment() {
        if (!this.hasOwnProperty('attachment')) {
            this.attachment = null;
        }
        return this.attachment;
    }

    getRecipients() {
        let recipients = [];
        if (this.hasOwnProperty('to')) {
            recipients.concat(this.to);
        }
        if (this.hasOwnProperty('cc')) {
            recipients.concat(this.cc);
        }
        if (this.hasOwnProperty('bto')) {
            recipients.concat(this.bto);
        }
        if (this.hasOwnProperty('bcc')) {
            recipients.concat(this.bcc);
        }
        if (this.hasOwnProperty('audience')) {
            recipients.concat(this.audience);
        }
        return recipients.flat()
            .filter((value, index, array) => array.indexOf(value) === index);
    }

    getStartTime() {
        if (!this.hasOwnProperty('startTime')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.startTime));
        return d || null;
    }

    getEndTime() {
        if (!this.hasOwnProperty('endTime')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.endTime));
        return d || null;
    }

    getPublished() {
        if (!this.hasOwnProperty('published')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.published));
        return d || null;
    }

    getUpdated() {
        if (!this.hasOwnProperty('updated')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.updated));
        return d || null;
    }

    getName() {
        if (!this.hasOwnProperty('name')) {
            this.name = [];
        }
        let s = this.name;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getSummary() {
        if (!this.hasOwnProperty('summary')) {
            this.summary = [];
        }
        let s = this.summary;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getContent() {
        if (!this.hasOwnProperty('content')) {
            this.content = [];
        }
        let s = this.content;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getIcon() {
        if (!this.hasOwnProperty('icon')) {
            this.icon = null;
        }
        return this.icon;
    }

    getImage() {
        if(!this.hasOwnProperty('image')) {
            this.image = null;
        }
        return this.image;
    }

    getPreferredUsername() {
        if (!this.hasOwnProperty('preferredUsername')) {
            this.preferredUsername = [];
        }
        let s = this.preferredUsername;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getItems() {
        let items = [];
        if (this.type.toLowerCase().includes('ordered') && this.hasOwnProperty('orderedItems')) {
            items = this['orderedItems'];
        } else if (this.hasOwnProperty('items')) {
            items = this['items'];
        }
        return items.sort(sortByPublished);
    }
}

function sortByPublished(a, b) {
    const aHas = a.hasOwnProperty('published');
    const bHas = b.hasOwnProperty('published');
    if (!aHas && !bHas) {
        return (a.id <= b.id) ? 1 : -1;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return Date.parse(b.published) - Date.parse(a.published);
}
