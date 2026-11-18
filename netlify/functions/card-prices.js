const https = require("https");

const SET_ID = 463;
const COND_MAP = {
  "Near Mint": "nm",
  "Lightly Played": "lp",
  "Moderately Played": "mp",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.PKMN_API_KEY;
    const req = https.request(url, { headers: { "X-API-Key": apiKey } }, (res) => {
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

  try {
    // Step 1: resolve pkmnprices card ID for this Base Set number
    const list = await fetchJson(
      `https://api.pkmnprices.com/v1/cards?set_id=${SET_ID}&number=${num}&per_page=1`
    );
    if (!list.data?.length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
        body: JSON.stringify({ prices: {} }),
      };
    }

    // Step 2: fetch full price data
    const detail = await fetchJson(`https://api.pkmnprices.com/v1/cards/${list.data[0].id}`);
    const prices = {};
    for (const p of detail.prices || []) {
      const key = COND_MAP[p.condition];
      if (key && !(key in prices) && p.market_price != null) {
        prices[key] = p.market_price;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
      body: JSON.stringify({ prices }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "upstream error" }) };
  }
};
