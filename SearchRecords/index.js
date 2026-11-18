const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");

const uri = process.env.COSMOS_DB_CONNECTION_STRING;
let mongoClient;

async function getClient(context) {
  if (!uri) { const e = "COSMOS_DB_CONNECTION_STRING is not set"; context.log.error(e); throw new Error(e); }
  if (!mongoClient) {
    mongoClient = new MongoClient(uri, { maxPoolSize: 10, retryWrites: true });
    await mongoClient.connect();
  }
  return mongoClient;
}

function getSwaPrincipal(req) {
  try {
    const b64 = req.headers["x-ms-client-principal"];
    if (!b64) return null;
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch { return null; }
}

module.exports = async function (context, req) {
  context.log("TH_Test_First_Form_Search_Function - search");
//   const principal = getSwaPrincipal(req);
//   if (!principal || !principal.userRoles?.includes("authenticated")) {
//     context.res = { status: 401, body: { error: "Unauthorized" } }; return;
//   }

  try {
    const client = await getClient(context);
    const db = client.db("cpProcessFlow");
    const coll = db.collection("FormData");

    const {
      formName,
      submittedBy,
      status,
      dateFrom,
      dateTo,
      searchText,
      limit = "50",
      skip = "0"
    } = req.query;

    const query = {};
    if (formName) query.formName = formName;
    if (submittedBy) query.submittedBy = submittedBy;
    if (status) query.status = status;

    // Date range on ISO strings (if you store dates as strings)
    if (dateFrom || dateTo) {
      query.$and = query.$and || [];
      if (dateFrom) query.$and.push({ submittedAt: { $gte: `${dateFrom}T00:00:00.000Z` } });
      if (dateTo)   query.$and.push({ submittedAt: { $lte: `${dateTo}T23:59:59.999Z` } });
    }

    if (searchText) {
      query.$or = [
        { formTitle: { $regex: searchText, $options: "i" } },
        { submittedBy: { $regex: searchText, $options: "i" } },
        { "sections.fields.value": { $regex: searchText, $options: "i" } }
      ];
    }

    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const skp = Math.max(parseInt(skip, 10) || 0, 0);

    const cursor = coll.find(query).sort({ submittedAt: -1 }).skip(skp).limit(lim);
    const [results, total] = await Promise.all([cursor.toArray(), coll.countDocuments(query)]);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { success: true, data: results, pagination: { total, limit: lim, skip: skp, hasMore: total > skp + lim } }
    };
  } catch (error) {
    context.log.error("Error searching records:", error);
    context.res = { status: 500, body: { success: false, error: "Failed to search records", details: error.message } };
  }
};