const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");
console.log("Strted")
const uri = process.env.COSMOS_DB_CONNECTION_STRING;
let mongoClient;


async function getClient(context) {
  if (!uri) { const e = "COSMOS_DB_CONNECTION_STRING is not set"; context.log.error(e); throw new Error(e); }
  if (!mongoClient) {
    mongoClient = new MongoClient(uri, { maxPoolSize: 10, retryWrites: true });
    await mongoClient.connect();
  }
   console.log("1")
  return mongoClient;
}
 
function getSwaPrincipal(req) {
  try {
    const b64 = req.headers["x-ms-client-principal"];
    console.log("2")
    if (!b64) return null;
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch { return null; }
}

module.exports = async function (context, req) {
  context.log("TH_Form_Schema_Function - get schema");

//   const principal = getSwaPrincipal(req);
//   if (!principal || !principal.userRoles?.includes("authenticated")) {
//     context.res = { status: 401, body: { error: "Unauthorized" } }; return;
//   }

context.log("DEBUG: Authentication bypassed for Azure Portal testing");

  const formName = req.query.formName || (req.body && req.body.formName);
  if (!formName) {
    context.res = { status: 400, body: { error: "Please provide formName in query or body" } };
    return;
  }

  try {
    const client = await getClient(context);
    const db = client.db("cpProcessFlow");
    const coll = db.collection("FormSchemas");

    const schema = await coll.findOne({ Form: formName });

    if (!schema) {
      context.res = { status: 404, body: { error: `Schema not found for formName: ${formName}` } };
      return;
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
      body: schema
    };
  } catch (error) {
    context.log.error("Error fetching schema:", error);
    context.res = { status: 500, body: { error: "Failed to fetch schema", details: error.message } };
  }
};