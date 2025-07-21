import {authorization} from "./utils";
import {ActivityPubItem} from "./activity-pub-item";

export async function fetchActivityPubIRI(iri) {
    if (typeof iri !== 'string') return new Promise((resolve, reject) => reject('invalid URL passed to function'));
    let headers = fetchHeaders;
    if (isLocalIRI(iri)) {
        const auth = authorization();
        if (auth.hasOwnProperty('token_type') && auth.hasOwnProperty('access_token')) {
            headers.Authorization = `${auth.token_type} ${auth.access_token}`;
        }
    } else {
        // generate HTTP-signature for the actor
    }
    return new Promise((resolve, reject) => {
        headers["Origin"] = 'https://'+window.location.hostname;
        console.info(`fetching ${isLocalIRI(iri) ? 'local' : 'remote'} IRI `, iri);
        const opts = {
            headers: headers,
            cache: 'force-cache',
        };
        fetch(iri, opts).then(response => {
            if (response.hasOwnProperty("headers") && response.headers["Content-Type"] !== jsonLDContentType) {
                reject(`invalid response Content-Type ${response.headers["Content-Type"]}`)
            }
            if (response.status !== 200) {
                reject(`Invalid status received ${response.statusText}`);
            } else {
                response.json().then(v => resolve(new ActivityPubItem(v))).catch(e => reject(e));
            }
        }).catch(e => reject(e))
    });
}

const jsonLDContentType = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const fetchHeaders = {Accept: jsonLDContentType};

export function isLocalIRI(iri) {
    if (typeof iri !== 'string') {
        return false;
    }
    return iri.indexOf(window.location.hostname) > 0;
}


