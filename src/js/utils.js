export function rgb(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
};

export function setStyles(bgColor) {
    bgColor = (bgColor || {r: 0, g: 0, b: 0});

    const bri = brightness(bgColor)
    const scheme = getColorScheme(bri);

    localStorage.setItem('colorScheme', scheme);
    localStorage.setItem('backgroundColor', rgb(bgColor));
};

export function rgba(rgb, a) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

function brightness(rgb) {
    //return ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    // from https://www.nbdtech.com/Blog/archive/2008/04/27/Calculating-the-Perceived-Brightness-of-a-Color.aspx
    return 255 - Math.sqrt((rgb.r * rgb.r * .241 + rgb.g * rgb.g * .691 + rgb.b * rgb.b * .068));
};

function getColorScheme(bri) {
    let scheme;
    if (Math.abs(bri - 120) < 75) {
        if (bri >= 130) {
            scheme = 'dark';
        } else {
            scheme = 'light';
        }
    } else if (bri > 120) {
        scheme = 'dark';
    } else {
        scheme = 'light';
    }
    return scheme;
};

export async function getAverageImageRGB(url) {
    let blockSize = 5, // only visit every 5 pixels
        i = -4, rgb = {r: 0, g: 0, b: 0}, count = 0, data;

    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    let img = await loadImage(url);

    canvas.width = img.width;
    canvas.height = img.height;
    context.drawImage(img, 0, 0);

    try {
        data = context.getImageData(0, 0, img.width, img.height);
    } catch (e) {
        console.error(`failed: ${e}`);
        return rgb;
    }

    const length = data.data.length;
    while ((i += blockSize * 4) < length) {
        ++count;
        rgb.r += data.data[i];
        rgb.g += data.data[i + 1];
        rgb.b += data.data[i + 2];
    }

    // ~~ used to floor values
    rgb.r = ~~(rgb.r / count);
    rgb.g = ~~(rgb.g / count);
    rgb.b = ~~(rgb.b / count);

    return rgb;
};

export function loadImage(url) {
    return new Promise(r => {
        let i = new Image();
        i.onload = (() => r(i));
        i.src = url;
    });
};

export function OnReady(a) {
    'loading' == document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
};

export async function fetchActivityPubIRI(iri) {
    const response = await fetch(iri, {headers: {Accept: 'application/activity+json'}}).catch(console.error);
    if (typeof response == 'undefined') {
        return null;
    }
    if (response.status != 200) {
        response.json().then(value => console.error(value.errors));
        return null;
    }
    const it = await response.json();
    return it;
};

export function isLocalIRI(iri) {
    return iri.indexOf(new URL(window.location).hostname) < 0
};

export function hostFromIRI(iri) {
    try {
        return (new URL(iri)).host;
    } catch (err) {
        return '';
    }
};