const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { ServiceBusClient } = require("@azure/service-bus");
const { MongoClient } = require("mongodb");


const uri = process.env.COSMOS_DB_CONNECTION_STRING;

let mongoClient;


const SERVICE_BUS_CONNECTION_STRING =
    process.env.SERVICE_BUS_CONNECTION_STRING;


const QUEUE_NAME =
    "form-submission-queue";



async function getClient(context) {

    if (!uri) {

        const error =
            "COSMOS_DB_CONNECTION_STRING is not set";

        context.log.error(error);

        throw new Error(error);
    }


    if (!mongoClient) {

        mongoClient =
            new MongoClient(
                uri,
                {
                    maxPoolSize: 10,
                    retryWrites:true
                }
            );


        await mongoClient.connect();

        context.log(
            "MongoDB connected"
        );

    }


    return mongoClient;
}




function getSwaPrincipal(req) {

    try {

        const b64 =
            req.headers["x-ms-client-principal"];


        if(!b64)
            return null;


        return JSON.parse(
            Buffer
            .from(b64,"base64")
            .toString("utf8")
        );

    }
    catch {

        return null;

    }
}





module.exports = async function(context,req){


    context.log(
        "SubmitForm function started"
    );



    if(
        (req.method || "GET")
        .toUpperCase() !== "POST"
    ){

        context.res={
            status:405,
            body:{
                error:"Method Not Allowed"
            }
        };

        return;
    }



    const principal =
        getSwaPrincipal(req);




    if(
        !req.body ||
        !Array.isArray(req.body.data) ||
        req.body.data.length===0
    ){

        context.res={
            status:400,
            body:{
                error:
                "Please pass a non-empty array in req.body.data"
            }
        };

        return;

    }



    try {


        const client =
            await getClient(context);



        const db =
            client.db(
                "cpProcessFlow"
            );



        const formCollection =
            db.collection(
                "FormData"
            );



        const schemaCollection =
            db.collection(
                "FormSchemas"
            );




        const now =
            new Date();




        /*
        ====================================
        CREATE FORM DATA DOCUMENTS
        ====================================
        */


        const documents =
            req.body.data.map(
                record=>{


                    const id =
                    record.id ||
                    `${record.formName || "Form"}_${Date.now()}_${Math.random()
                    .toString(36)
                    .substring(2,8)}`;



                    return {

                        _id:id,


                        Form:
                            record.formName ||
                            "Purchase",


                        ...record,


                        createdAt:now,


                        createdBy:
                            principal?.userDetails ||
                            principal?.userId ||
                            "unknown"

                    };

                }
            );





        /*
        ====================================
        INSERT FORM DATA
        ====================================
        */


        const result =
            await formCollection.insertMany(
                documents
            );



        context.log(
            `${result.insertedCount} records inserted`
        );





        /*
        ====================================
        GET WORKFLOW SCHEMA
        ====================================
        */


        const messages =
            await Promise.all(

                documents.map(
                    async document=>{


                        const schema =
                            await schemaCollection.findOne(
                                {
                                    Form:
                                    document.Form
                                }
                            );



                        if(!schema){

                            throw new Error(
                                `Workflow schema not found for ${document.Form}`
                            );

                        }




                        /*
                        ====================================
                        COMPLETE EVENT PAYLOAD
                        ====================================
                        */


                        return {


                            body:{


                                eventType:
                                "Form_Response_Record_Created",



                                submissionId:
                                document._id,



                                formName:
                                document.Form,



                                database:
                                "cpProcessFlow",



                                collection:
                                "FormData",



                                createdAt:
                                document.createdAt,



                                /*
                                Actual submitted data
                                */
                                submission:
                                document,



                                /*
                                Workflow configuration
                                */
                                workflow:
                                schema.Workflow,



                                schemaVersion:
                                schema.Version || "1.0"


                            }

                        };

                    }
                )

            );






        /*
        ====================================
        SEND TO SERVICE BUS
        ====================================
        */


        if(!SERVICE_BUS_CONNECTION_STRING){

            throw new Error(
                "SERVICE_BUS_CONNECTION_STRING is missing"
            );

        }




        const sbClient =
            new ServiceBusClient(
                SERVICE_BUS_CONNECTION_STRING
            );



        const sender =
            sbClient.createSender(
                QUEUE_NAME
            );





        await sender.sendMessages(
            messages
        );



        context.log(
            `${messages.length} Service Bus messages sent`
        );



        await sender.close();

        await sbClient.close();






        context.res={


            status:201,


            headers:{
                "content-type":
                "application/json"
            },


            body:{


                message:
                "Record inserted and workflow event created",


                insertedCount:
                result.insertedCount,


                serviceBusMessages:
                messages.length


            }

        };



    }
    catch(error){


        context.log.error(
            "SubmitForm Error:",
            error.message
        );



        context.res={


            status:500,


            body:{


                error:
                "Failed to submit form",


                details:
                error.message

            }

        };

    }


};