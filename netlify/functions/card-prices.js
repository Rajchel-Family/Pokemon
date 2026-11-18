const https = require("https");

const SET_ID = 463;
const PPT_SET_ID = 604;
const COND_MAP = {
  "Near Mint": "nm",
  "Lightly Played": "lp",
  "Moderately Played": "mp",
};

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const num = parseInt(event.queryStringParameters?.num);
  if (!num || num < 1 || num > 102) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid card number" }) };
  }

  const pkmnKey = process.env.PKMN_API_KEY;
  const pokepriceKey = process.env.POKEPRICE_API_KEY;

  try {
    // Step 1: resolve pkmnprices card ID + name
    const list = await fetchJson(
      `https://api.pkmnprices.com/v1/cards?set_id=${SET_ID}&number=${num}&per_page=1`,
      { "X-API-Key": pkmnKey }
    );
    if (!list.data?.length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
        body: JSON.stringify({ prices: {}, psa: {} }),
      };
    }

    const cardId = list.data[0].id;
    const cardName = list.data[0].name;

    // Step 2: fetch raw TCG prices from pkmnprices
    const detail = await fetchJson(
      `https://api.pkmnprices.com/v1/cards/${cardId}`,
      { "X-API-Key": pkmnKey }
    );
    const prices = {};
    for (const p of detail.prices || []) {
      const key = COND_MAP[p.condition];
      if (key && !(key in prices) && p.market_price != null) {
        prices[key] = p.market_price;
      }
    }

    // Step 3: fetch PSA grades from PokemonPriceTracker
    const psa = {};
    if (pokepriceKey) {
      try {
        const enc = encodeURIComponent(cardName);
        const pptData = await fetchJson(
          `https://www.pokemonpricetracker.com/api/v2/cards?setId=${PPT_SET_ID}&search=${enc}&includeEbay=true&limit=1`,
          { "Authorization": `Bearer ${pokepriceKey}` }
        );
        const grades = pptData.data?.[0]?.ebay?.salesByGrade || {};
        for (const grade of ["psa10", "psa9", "psa8", "psa7", "psa6"]) {
          const g = grades[grade];
          if (g) {
            psa[grade] = g.smartMarketPrice?.price ?? g.averagePrice ?? null;
          }
        }
      } catch (e) {
        // PSA lookup failed — return raw prices only
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
      body: JSON.stringify({ prices, psa }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "upstream error" }) };
  }
};
