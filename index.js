const express = require("express");
const RESOLVERS = require("./data");
const dns2 = require("dns2");
const cors = require("cors");
const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Supported DNS record types
const VALID_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "PTR",
  "SOA",
  "SRV",
  "TXT",
  "CAA",
];

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/check", async (req, res) => {
  const { domain, type = "A" } = req.query;
  const recordType = type.toUpperCase();

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  if (!VALID_TYPES.includes(recordType)) {
    return res.status(400).json({
      error: `Invalid record type. Supported types: ${VALID_TYPES.join(", ")}`,
    });
  }

  const results = await Promise.all(
    RESOLVERS.map(async ({ location, ip, lat, lon, provider, countryCode }) => {
      const dns = new dns2({ dns: ip });

      try {
        let response;

        // Use a generic query method for SOA records and any other types that lack specific methods
        if (recordType === "SOA" || !dns[`resolve${recordType}`]) {
          // Using the generic query method
          console.log(recordType, domain);
          response = await dns.query(domain, recordType);
          console.log("Rspomse", response);
        } else {
          // Use type-specific methods when available
          const resolveMethod = `resolve${recordType}`;
          response = await dns[resolveMethod](domain);
        }

        // Check if we have answers at all
        if (!response || !response.answers || response.answers.length === 0) {
          return {
            location,
            ip,
            status: "error",
            error: "No records found",
            lat,
            lon,
            countryCode,
            provider,
          };
        }

        // Handle different response formats based on record type
        let answers;
        if (recordType === "A" || recordType === "AAAA") {
          answers = response.answers.map((a) => a.address || a.data);
        } else if (recordType === "MX") {
          answers = response.answers.map((a) => ({
            exchange: a.exchange,
            priority: a.priority,
          }));
        } else if (recordType === "SOA") {
          answers = response.answers.map((a) => ({
            mname: a.primary || a.mname,
            rname: a.admin || a.rname,
            serial: a.serial,
            refresh: a.refresh,
            retry: a.retry,
            expire: a.expire,
            minttl: a.minimum || a.minttl,
          }));
        } else if (recordType === "SRV") {
          answers = response.answers.map((a) => ({
            priority: a.priority,
            weight: a.weight,
            port: a.port,
            target: a.target,
          }));
        } else {
          // Generic handling for other record types
          answers = response.answers.map((a) => a.data || a);
        }

        return {
          location,
          ip,
          status: "ok",
          answers,
          lat,
          lon,
          provider,
          countryCode,
        };
      } catch (err) {
        console.log(err);
        return {
          location,
          ip,
          status: "error",
          error: err.message,
          lat,
          lon,
          provider,
          countryCode,
        };
      }
    })
  );

  res.json({ domain, type: recordType, results });
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT:${PORT}`);
});
