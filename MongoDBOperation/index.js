const { MongoClient } = require("mongodb");


const uri = process.env.COSMOS_DB_CONNECTION_STRING;


let client;


async function connectMongo(){

    if(!client){

        client = new MongoClient(uri);

        await client.connect();

    }

    return client;

}



module.exports = async function(context,req){

    try{


        const body = req.body;


        if(!body.operation){

            throw new Error(
                "operation is required"
            );

        }


        const mongo =
            await connectMongo();



        const db =
            mongo.db("cpProcessFlow");



        const collection =
            db.collection(
                body.collection
            );



        let result;



        switch(body.operation){



            case "update":


                result =
                await collection.updateOne(

                    body.filter,

                    {
                        $set:
                        {
                            ...body.data
                        }
                    }

                );


            break;



            case "insert":


                result =
                await collection.insertOne(

                    body.data

                );


            break;

            case "findMany":

                result =
                await collection.find(body.filter).toArray();

            break;

            case "find":


                result =
                await collection.findOne(

                    body.filter

                );


            break;



            default:


                throw new Error(
                    "Unsupported operation"
                );

        }



        context.res={

            status:200,

            body:{

                success:true,

                result:result

            }

        };


    }
    catch(error){


        context.log.error(
            error.message
        );


        context.res={

            status:500,

            body:{

                success:false,

                error:error.message

            }

        };

    }

};