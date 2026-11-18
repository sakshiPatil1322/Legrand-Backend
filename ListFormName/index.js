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
  context.log("TH_Lists_Schema_Function - list forms");
//   const principal = getSwaPrincipal(req);
//   if (!principal || !principal.userRoles?.includes("authenticated")) {
//     context.res = { status: 401, body: { error: "Unauthorized" } }; return;
//   }

  try {
    const client = await getClient(context);
    const db = client.db("cpProcessFlow");
    const coll = db.collection("FormSchemas");

    // Return array of distinct form names
    // const forms = await coll.distinct("Form");
    const forms = await coll.find({}, { projection: { Form: 1, _id: 0, } }).toArray(); // copied from the older version ticked009

    context.res = {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
      body: forms
    };
  } catch (err) {
    context.log.error("Error listing schemas:", err);
    context.res = { status: 500, body: { error: "Failed to fetch schema list", details: err.message } };
  }
};