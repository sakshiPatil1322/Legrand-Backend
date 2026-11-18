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
  context.log("TH_Get_Records_Function - get record by id");
//   const principal = getSwaPrincipal(req);
//   if (!principal || !principal.userRoles?.includes("authenticated")) {
//     context.res = { status: 401, body: { error: "Unauthorized" } }; return;
//   }

  const recordId = req.query.id || (req.body && req.body.id);
  if (!recordId) {
    context.res = { status: 400, body: { success: false, error: "Please provide a record ID (id)" } };
    return;
  }

  try {
    const client = await getClient(context);
    const db = client.db("cpProcessFlow");
    const coll = db.collection("FormData");

    const record = await coll.findOne({ _id: recordId });

    if (!record) {
      context.res = { status: 404, body: { success: false, error: "Record not found" } };
      return;
    }

    context.res = { status: 200, headers: { "content-type": "application/json" }, body: { success: true, data: record } };
  } catch (error) {
    context.log.error("Error getting record:", error);
    context.res = { status: 500, body: { success: false, error: "Failed to get record", details: error.message } };
  }
};