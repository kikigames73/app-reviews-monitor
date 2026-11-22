// App Store (Apple RSS JSON, public) + Google Play (google-play-scraper) reviews, normalized.

export function parseAppRef(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    let m = s.match(/apps\.apple\.com\/(?:([a-z]{2})\/)?app\/(?:[^/]+\/)?id(\d+)/i) || s.match(/^(?:id)?(\d{6,})$/);
    if (m) return { store: 'appstore', id: m[2] ?? m[1], country: m[2] ? (m[1] || null) : null };
    m = s.match(/play\.google\.com\/store\/apps\/details\?(?:.*&)?id=([\w.]+)/i);
    if (m) return { store: 'googleplay', id: m[1], country: null };
    if (/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(s)) return { store: 'googleplay', id: s, country: null };
    return null;
}

const lbl = (o) => (o && typeof o === 'object' ? o.label : o) ?? null;

export function normalizeAppleEntry(e, { appId, country }) {
    return {
        store: 'appstore',
        appId,
        country,
        reviewId: lbl(e.id),
        rating: Number(lbl(e['im:rating'])) || null,
        title: lbl(e.title),
        text: lbl(e.content),
        author: lbl(e.author?.name),
        version: lbl(e['im:version']),
        date: lbl(e.updated) ? new Date(lbl(e.updated)).toISOString() : null,
        thumbsUp: Number(lbl(e['im:voteSum'])) || 0,
        replyText: null,
        url: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
    };
}

export function normalizeGplayReview(r, { appId, country }) {
    return {
        store: 'googleplay',
        appId,
        country,
        reviewId: r.id ?? null,
        rating: r.score ?? null,
        title: r.title ?? null,
        text: r.text ?? null,
        author: r.userName ?? null,
        version: r.version ?? null,
        date: r.date ? new Date(r.date).toISOString() : null,
        thumbsUp: r.thumbsUp ?? 0,
        replyText: r.replyText ?? null,
        url: r.url ?? `https://play.google.com/store/apps/details?id=${appId}&showAllReviews=true`,
    };
}

export async function fetchAppleReviews({ appId, country, max, fetchImpl = fetch, sleepMs = 300 }) {
    const out = [];
    for (let page = 1; page <= 10 && out.length < max; page++) {
        const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
        let data;
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetchImpl(url);
            if (res.ok) { data = await res.json().catch(() => null); break; }
            if (res.status === 404 || res.status === 400) break;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
        let entries = data?.feed?.entry ?? [];
        if (!Array.isArray(entries)) entries = [entries];
        // Old feeds included the app itself as first entry (no rating) — skip it
        entries = entries.filter((e) => e['im:rating']);
        if (entries.length === 0) break;
        out.push(...entries.map((e) => normalizeAppleEntry(e, { appId, country })));
        await new Promise((r) => setTimeout(r, sleepMs));
    }
    return out.slice(0, max);
}

export async function fetchAppleInfo({ appId, country, fetchImpl = fetch }) {
    const res = await fetchImpl(`https://itunes.apple.com/lookup?id=${appId}&country=${country}`);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const a = j?.results?.[0];
    if (!a) return null;
    return { name: a.trackName, developer: a.artistName, storeRating: a.averageUserRating ?? null, storeRatingCount: a.userRatingCount ?? null, currentVersion: a.version ?? null };
}

export async function fetchGplayReviews({ gplay, appId, country, lang, max }) {
    const out = [];
    let token;
    do {
        const res = await gplay.reviews({ appId, country, lang, sort: gplay.sort.NEWEST, num: Math.min(150, max - out.length), paginate: true, nextPaginationToken: token });
        const data = res?.data ?? [];
        out.push(...data.map((r) => normalizeGplayReview(r, { appId, country })));
        token = res?.nextPaginationToken;
        if (data.length === 0) break;
    } while (token && out.length < max);
    return out.slice(0, max);
}

export async function fetchGplayInfo({ gplay, appId, country, lang }) {
    try {
        const a = await gplay.app({ appId, country, lang });
        return { name: a.title, developer: a.developer, storeRating: a.score ?? null, storeRatingCount: a.ratings ?? null, currentVersion: a.version ?? null };
    } catch {
        return null;
    }
}

const STOP = new Set(('the a an and or but to of in on for with is it this that i my me you your we they app its it\'s are was be have has not no so very just can do does did at as if all get got from too more when what would will out up there than then them their also only one even still use using after again any been were because about how le la les un une des de du et ou mais à au aux en dans pour par sur avec est ce cette je j me mon ma mes tu vous nous ils elle on pas plus très tout tous que qui quoi ne n y a l d c s qu sa son ses leur leurs été être avoir fait faire bien comme sans si oui non die der das und ist nicht ich es el la los las y que de en no es por para con una un').split(/\s+/));

export function topKeywords(texts, n = 10) {
    const counts = new Map();
    for (const t of texts) {
        const words = new Set(String(t ?? '').toLowerCase().normalize('NFKC').match(/[\p{L}]{4,}/gu) ?? []);
        for (const w of words) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
}

export function summarize({ store, appId, country, info, reviews }) {
    const rated = reviews.filter((r) => r.rating);
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rated) dist[r.rating] = (dist[r.rating] ?? 0) + 1;
    const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null;
    const byVersion = {};
    for (const r of rated) {
        const v = r.version ?? 'unknown';
        byVersion[v] ??= { count: 0, sum: 0 };
        byVersion[v].count++;
        byVersion[v].sum += r.rating;
    }
    const versions = Object.entries(byVersion)
        .map(([version, x]) => ({ version, count: x.count, avgRating: Math.round((x.sum / x.count) * 100) / 100 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    const negative = rated.filter((r) => r.rating <= 2);
    const dates = reviews.map((r) => r.date).filter(Boolean).sort();
    return {
        type: 'summary',
        store,
        appId,
        country,
        appName: info?.name ?? null,
        developer: info?.developer ?? null,
        storeRating: info?.storeRating ?? null,
        storeRatingCount: info?.storeRatingCount ?? null,
        currentVersion: info?.currentVersion ?? null,
        reviewsAnalyzed: reviews.length,
        periodFrom: dates[0] ?? null,
        periodTo: dates[dates.length - 1] ?? null,
        avgRatingInSample: avg === null ? null : Math.round(avg * 100) / 100,
        ratingDistribution: dist,
        negativeShare: rated.length ? Math.round((negative.length / rated.length) * 1000) / 10 : null,
        ratingByVersion: versions,
        topComplaintKeywords: topKeywords(negative.map((r) => `${r.title ?? ''} ${r.text ?? ''}`)),
        topPraiseKeywords: topKeywords(rated.filter((r) => r.rating >= 4).map((r) => `${r.title ?? ''} ${r.text ?? ''}`)),
    };
}

export function monitorStoreName(name) {
    const clean = String(name || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `app-reviews-monitor-${clean || 'default'}`;
}
