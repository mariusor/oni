/**
 * A port of JWZ's email threading algorithm for ActivityPub items.
 * The changes we've done are to accommodate the differences between ActivityPub threading and mail threading.
 *  1. we dispense with the inReplyTo/References complexities
 *  2. we use the object's ID instead of subject
 */

export class Node {
    constructor(it) {
        this.item = it;
        this.children = [];
        this.parent = null;
    }
    get id () {
        return this.item?.id || null;
    }
    get isDummy() {
        return this.item == null;
    }
}

export function Thread(items) {
    const idTable = new Map();

    // Step 1: create nodes for all messages
    for (const item of items) {
        if (!item?.id) continue; // skip messages without id
        if (!idTable.has(item.id)) {
            idTable.set(item.id, new Node(item));
        }
    }

    function getRefs(item) {
        if (!item) return [];
        if (!item.inReplyTo) return [];
        return Array.isArray(item.inReplyTo) && item.inReplyTo.length > 0
            ? item.inReplyTo : (item.inReplyTo === 'string' && item.inReplyTo.length > 0 ? [item.inReplyTo] : []);
    }

    // Step 2: create dummy nodes for missing parents
    function getOrCreateNode(id) {
        if (!idTable.has(id)) {
            idTable.set(id, new Node(null)); // dummy node
        }
        return idTable.get(id);
    }

    // Step 3: link nodes based on inReplyTo
    for (const item of items) {
        const node = idTable.get(item.id);

        // Build the inReplyTo chain
        const refs = getRefs(item);
        let parent = null;
        for (const ref of refs) {
            const refNode = getOrCreateNode(ref);
            if (parent && !refNode.parent) {
                refNode.parent = parent;
                parent.children.push(refNode);
            }
            parent = refNode;
        }
        // Now link this message as child of the last reference
        if (parent && !node.parent) {
            node.parent = parent;
            parent.children.push(node);
        }
    }

    // Step 4: collect root nodes (no parent, not dummy, or dummy with children)
    const roots = [];
    for (const node of idTable.values()) {
        if (!node.parent && (!node.isDummy || node.children.length > 0)) {
            roots.push(node);
        }
    }

    return roots;
}