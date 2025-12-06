/**
 * A port of JWZ's email threading algorithm for ActivityPub items.
 * The changes we've done are to accommodate the differences between ActivityPub threading and mail threading.
 *  1. We dispense with the inReplyTo/References complexities
 *  2. We use the object's ID instead of subject
 *  3. We take into account that a Node can reference multiple parents.
 */

export class Node {
    constructor(it) {
        this.item = it;
        this.children = [];
        this.parent = null;
    }
    get id() {
        return this.item?.id || null;
    }
    get isDummy() {
        return !this.item;
    }
}

export function Thread(items) {
    const idTable = new Map();
    const refsTable = new Map();

    // Step 1: create nodes for all messages, and build the parent reference map
    for (const item of items) {
        if (!item?.id) continue; // skip messages without id
        if (!idTable.has(item.id)) {
            idTable.set(item.id, new Node(item));
            refsTable.set(item.id, new Set(getRefs(item)));
        }
    }

    function getRefs(item) {
        if (!item) return [];
        if (Array.isArray(item?.inReplyTo)) return item.inReplyTo;
        if (typeof item?.inReplyTo === 'string') {
            if (item?.inReplyTo.length === 0) return [];
            return [item?.inReplyTo];
        }
        return [];
    }

    // Step 2: create dummy nodes for missing parents
    function getOrCreateNode(id) {
        if (!idTable.has(id)) {
            idTable.set(id, new Node(null)); // dummy node
        }
        return idTable.get(id);
    }

    // Step 3: link nodes based on inReplyTo ids
    for (const item of items) {
        const node = idTable.get(item.id);

        // Build the inReplyTo chain
        const itemRefs = refsTable.get(item.id)
        let allParentRefs = new Set();
        itemRefs.forEach(parentRef => {
            refsTable.get(parentRef)?.forEach(it => allParentRefs.add(it));
        });

        // Try to establish which is the immediate parent
        const parentId = itemRefs?.difference(allParentRefs)?.values()?.next()?.value;
        if (!parentId) continue;

        const parent = getOrCreateNode(parentId);
        // Now link this node as child of the found parent
        if (!node.parent) {
            node.parent = parent;
            parent.children?.push(node);
        }
    }

    // Step 4: collect root nodes (no parent, not dummy, or dummy with children)
    const roots = [];
    for (const node of idTable.values()) {
        const isRoot = !node.parent && (!node.isDummy || node.children.length > 0);
        if (isRoot) {
            // NOTE(marius): I'm not sure if the fact that the items that have children get pushed to a dummy node
            // is a bug or some piece of logic that I'm not following, but I think this is a solution until I find out.
            if (node.isDummy) {
                node.children.forEach(child => roots.push(child))
            } else {
                roots.push(node);
            }
        }
    }

    return roots;
}
