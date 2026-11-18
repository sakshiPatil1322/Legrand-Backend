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
  context.log("TH_Test_First_Form_Update_Function - update record");
//   const principal = getSwaPrincipal(req);
//   if (!principal || !principal.userRoles?.includes("authenticated")) {
//     context.res = { status: 401, body: { success: false, error: "Unauthorized" } }; return;
//   }

  if (!req.body || !req.body.data) {
    context.res = { status: 400, body: { success: false, error: "Please provide record data in req.body.data" } };
    return;
  }

  const recordData = req.body.data;
  const recordId = recordData._id || recordData.id;
  if (!recordId) {
    context.res = { status: 400, body: { success: false, error: "Record ID is required" } };
    return;
  }

  try {
    const client = await getClient(context);
    const db = client.db("cpProcessFlow");
    const coll = db.collection("FormData");

    const updateDoc = {
      ...recordData,
      updatedAt: new Date().toISOString(),
      Form: recordData.formName || recordData.Form || "Purchase"
    };
    delete updateDoc._id;
    delete updateDoc.id;

    const result = await coll.updateOne({ _id: recordId }, { $set: updateDoc });

    if (result.matchedCount === 0) {
      context.res = { status: 404, body: { success: false, error: "Record not found" } };
      return;
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { success: true, message: "Record updated successfully", modifiedCount: result.modifiedCount }
    };
  } catch (error) {
    context.log.error("Error updating record:", error);
    context.res = { status: 500, body: { success: false, error: "Failed to update record", details: error.message } };
  }
};