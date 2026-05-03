const CACHE_KEY = "avbyusd_rate_cache_v1";
const CACHE_TTL_MS = 45 * 60 * 1000;
const MYFIN_USD_URL = "https://myfin.by/currency/usd";
const NBRB_USD_URL =
  "https://api.nbrb.by/exrates/rates/USD?parammode=2&periodicity=0";

function parseMyfinNbrbUsd(html) {
  const m = html.match(
    /data-popover-selector="nbrbUSD"[\s\S]{0,5000}?<span class="accent">\s*([\d.,]+)\s*</i
  );
  if (!m) return null;
  const n = parseFloat(String(m[1]).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchMyfinBynPerUsd() {
  const res = await fetch(MYFIN_USD_URL, {
    credentials: "omit",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`myfin HTTP ${res.status}`);
  const html = await res.text();
  const rate = parseMyfinNbrbUsd(html);
  if (!rate) throw new Error("myfin parse");
  return { bynPerUsd: rate, source: "myfin.by (НБРБ)" };
}

async function fetchNbrbBynPerUsd() {
  const res = await fetch(NBRB_USD_URL, { credentials: "omit" });
  if (!res.ok) throw new Error(`nbrb HTTP ${res.status}`);
  const data = await res.json();
  const scale = Number(data.Cur_Scale) || 1;
  const official = Number(data.Cur_OfficialRate);
  if (!Number.isFinite(official) || official <= 0) throw new Error("nbrb data");
  return { bynPerUsd: official / scale, source: "api.nbrb.by" };
}

async function loadRate(forceRefresh) {
  if (!forceRefresh && typeof chrome !== "undefined" && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const hit = stored[CACHE_KEY];
    if (
      hit &&
      typeof hit.bynPerUsd === "number" &&
      typeof hit.fetchedAt === "number" &&
      Date.now() - hit.fetchedAt < CACHE_TTL_MS
    ) {
      return {
        bynPerUsd: hit.bynPerUsd,
        source: hit.source || "cache",
        fetchedAt: hit.fetchedAt,
        fromCache: true,
      };
    }
  }

  let bynPerUsd;
  let source;
  try {
    ({ bynPerUsd, source } = await fetchMyfinBynPerUsd());
  } catch {
    ({ bynPerUsd, source } = await fetchNbrbBynPerUsd());
  }

  const payload = { bynPerUsd, source, fetchedAt: Date.now() };
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [CACHE_KEY]: payload });
  }
  return { ...payload, fromCache: false };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "GET_USD_RATE") return;
  loadRate(Boolean(msg.forceRefresh))
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) =>
      sendResponse({
        ok: false,
        error: e && e.message ? e.message : String(e),
      })
    );
  return true;
});
