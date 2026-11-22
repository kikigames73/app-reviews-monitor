import { Actor, log } from 'apify';
import gplay from 'google-play-scraper';
import {
    parseAppRef, fetchAppleReviews, fetchAppleInfo, fetchGplayReviews, fetchGplayInfo, summarize, monitorStoreName,
} from './lib.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    apps = [],
    countries = ['us'],
    language = 'en',
    maxReviewsPerApp = 200,
    minRating = 1,
    maxRating = 5,
    includeSummary = true,
    monitorMode = false,
    monitorName = 'default',
} = input;

const refs = [];
for (const raw of apps) {
    const ref = parseAppRef(raw);
    if (ref) refs.push(ref);
    else log.warning(`Unrecognized app reference ignored: "${raw}"`);
}
if (refs.length === 0) {
    await Actor.fail('No valid app in input. Use App Store URLs/IDs (e.g. https://apps.apple.com/us/app/id310633997) or Google Play URLs/package names (e.g. com.whatsapp).');
}
const ctry = (countries.length ? countries : ['us']).map((c) => String(c).toLowerCase().slice(0, 2));

let store = null;
let seen = {};
if (monitorMode) {
    store = await Actor.openKeyValueStore(monitorStoreName(monitorName));
    seen = (await store.getValue('seen')) ?? {};
    log.info(`Monitoring mode: only reviews not seen in previous runs of "${monitorName}" will be output.`);
}

let stop = false;
const charge = async (eventName, count = 1) => {
    if (count <= 0) return;
    const res = await Actor.charge({ eventName, count });
    if (res?.eventChargeLimitReached) stop = true;
};

for (const ref of refs) {
    if (stop) break;
    const targetCountries = ref.country ? [ref.country] : ctry;
    const seenGplayIds = new Set();
    for (const country of targetCountries) {
        if (stop) break;
        const key = `${ref.store}:${ref.id}:${country}`;
        try {
            const max = Math.max(1, Math.min(ref.store === 'appstore' ? 500 : 5000, maxReviewsPerApp));
            const [info, reviewsRaw] = ref.store === 'appstore'
                ? await Promise.all([fetchAppleInfo({ appId: ref.id, country }), fetchAppleReviews({ appId: ref.id, country, max })])
                : await Promise.all([fetchGplayInfo({ gplay, appId: ref.id, country, lang: language }), fetchGplayReviews({ gplay, appId: ref.id, country, lang: language, max })]);

            let reviews = reviewsRaw.filter((r) => !r.rating || (r.rating >= minRating && r.rating <= maxRating));
            if (ref.store === 'googleplay') reviews = reviews.filter((r) => (seenGplayIds.has(r.reviewId) ? false : seenGplayIds.add(r.reviewId)));
            if (monitorMode) {
                const prev = new Set(seen[key] ?? []);
                const firstRun = !seen[key];
                const fresh = reviews.filter((r) => !prev.has(r.reviewId));
                seen[key] = [...new Set([...reviews.map((r) => r.reviewId), ...(seen[key] ?? [])])].slice(0, 3000);
                reviews = fresh;
                log.info(`${key}: ${fresh.length} new reviews${firstRun ? ' (first run: baseline)' : ''}.`);
            }
            const appName = info?.name ?? null;
            const items = reviews.map((r) => ({ type: 'review', appName, ...r }));
            if (items.length) {
                await Actor.pushData(items);
                await charge('review', items.length);
            }
            if (includeSummary && reviews.length && !stop) {
                await Actor.pushData(summarize({ store: ref.store, appId: ref.id, country, info, reviews }));
                await charge('app-summary', 1);
            }
            log.info(`${key} (${appName ?? '?'}): ${items.length} reviews output.`);
        } catch (e) {
            log.error(`Failed for ${key}: ${e.message}`);
            await Actor.pushData({ type: 'error', store: ref.store, appId: ref.id, country, error: e.message });
        }
    }
}

if (store) await store.setValue('seen', seen);
await Actor.exit();
