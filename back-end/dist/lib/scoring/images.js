import Jimp from "jimp";
function aHash(img, size = 8) {
    const small = img.clone().resize(size, size).greyscale();
    const pixels = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const { r } = Jimp.intToRGBA(small.getPixelColor(x, y));
            pixels.push(r);
        }
    }
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    return pixels.map(v => (v >= avg ? "1" : "0")).join("");
}
function hamming(a, b) {
    const n = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++)
        if (a[i] !== b[i])
            d++;
    return d + Math.abs(a.length - b.length);
}
function edgeEnergy(img) {
    const g = img.clone().greyscale();
    const w = g.getWidth(), h = g.getHeight();
    let sum = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const c = Jimp.intToRGBA(g.getPixelColor(x, y)).r;
            const l = Jimp.intToRGBA(g.getPixelColor(x - 1, y)).r;
            const r = Jimp.intToRGBA(g.getPixelColor(x + 1, y)).r;
            const u = Jimp.intToRGBA(g.getPixelColor(x, y - 1)).r;
            const d = Jimp.intToRGBA(g.getPixelColor(x, y + 1)).r;
            const lap = (4 * c - l - r - u - d);
            sum += Math.abs(lap);
            count++;
        }
    }
    return sum / (count || 1);
}
export async function extractImageSignals(imageBuffers, knownHashes, weightMap) {
    const signals = [];
    const hashes = [];
    for (const buf of imageBuffers) {
        try {
            const img = await Jimp.read(buf);
            const hash = aHash(img, 8);
            hashes.push(hash);
            let minD = Infinity;
            for (const h of knownHashes)
                minD = Math.min(minD, hamming(hash, h));
            if (knownHashes.length && minD <= 6) {
                const id = "image_reuse_suspected";
                const weight = weightMap[id] ?? 0;
                const value = Math.min(1, (7 - minD) / 7);
                signals.push({
                    id, category: "Images",
                    label: "Photo looks reused from other listings",
                    why_it_matters: "Scammers often reuse attractive photos across multiple fake listings.",
                    evidence: `Perceptual hash similarity (distance ${minD})`,
                    value, weight,
                    contribution: weight * value,
                    severity: "medium"
                });
            }
            const e = edgeEnergy(img.clone().resize(256, Jimp.AUTO));
            if (e < 9) {
                const id = "image_low_quality";
                const weight = weightMap[id] ?? 0;
                const value = Math.min(1, (9 - e) / 9);
                signals.push({
                    id, category: "Images",
                    label: "Image quality is unusually low",
                    why_it_matters: "Very low-quality photos can indicate reposts, heavy compression, or scraped content.",
                    evidence: `Edge energy score: ${Math.round(e * 10) / 10}`,
                    value, weight,
                    contribution: weight * value,
                    severity: "low"
                });
            }
        }
        catch { }
    }
    return { signals, hashes };
}
