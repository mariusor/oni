
export const ObjectTypes = ['Image', 'Audio', 'Video', 'Note', 'Article', 'Page', 'Document', 'Tombstone', ''];
export const ActorTypes = ['Person', 'Group', 'Application', 'Service'];
export const ActivityTypes = [ 'Create', 'Update', 'Delete', 'Accept', 'Reject', 'TentativeAccept', 'TentativeReject', 'Follow', 'Block', 'Ignore' ];
export const CollectionTypes = [ 'Collection', 'CollectionPage', 'OrderedCollection', 'OrderedCollectionPage'];

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
        const setPropIfExists = (p) => { if (it.hasOwnProperty(p)) this[p] = it[p]; };
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
        return this.hasOwnProperty('url') ? this.url : null;
    }

    getAttachment() {
        if (!this || !this.hasOwnProperty('attachment')) {
            return null;
        }
        return this.attachment;
    }

    getRecipients() {
        let recipients = [];
        if (this.it == null) {
            return recipients;
        }
        if (this.it.hasOwnProperty('to')) {
            recipients.concat(this.it.to);
        }
        if (this.it.hasOwnProperty('cc')) {
            recipients.concat(this.it.cc);
        }
        if (this.it.hasOwnProperty('bto')) {
            recipients.concat(this.it.bto);
        }
        if (this.it.hasOwnProperty('bcc')) {
            recipients.concat(this.it.bcc);
        }
        if (this.it.hasOwnProperty('audience')) {
            recipients.concat(this.it.audience);
        }
        return recipients.flat()
            .filter((value, index, array) => array.indexOf(value) === index);
    }


    getPublished() {
        if (!this || !this.hasOwnProperty('published')) {
            return null;
        }
        const d = new Date();
        d.setTime(Date.parse(this.published));
        return d || null;
    }

    getName() {
        if (!this.hasOwnProperty('name')) {
            return [];
        }
        let s = this.name;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getSummary() {
        if (!this.hasOwnProperty('summary')) {
            return [];
        }
        let s = this.summary;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getContent() {
        if (!this.hasOwnProperty('content')) {
            return [];
        }
        let s = this.content;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getIcon() {
        if (this == null) {
            return null;
        }
        return this.hasOwnProperty('icon') ? this.icon : null;
    }

    getImage() {
        if (this == null) {
            return null;
        }
        return this.hasOwnProperty('image') ? this.image : null;
    }

    getPreferredUsername() {
        if (!this.hasOwnProperty('preferredUsername')) {
            return [];
        }
        let s = this.preferredUsername;
        if (!Array.isArray(s)) {
            s = [s];
        }
        return s;
    }

    getItems() {
        let items = [];
        if (this === null) {
            return items;
        }
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
