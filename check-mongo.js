const {MongoClient} = require("mongodb");

async function main() {
  // Connection URL
  const uri = "MONGO_URL";
  const client = new MongoClient(uri);

  try {
    // Connect to the MongoDB server
    await client.connect();
    console.log("Connected to MongoDB");

    // Get the database
    const db = client.db("ragster");

    // Get the collection
    const settings = db.collection("settings");

    // Find all settings
    const allSettings = await settings.find({}).toArray();
    console.log("Settings in database:");
    console.log(JSON.stringify(allSettings, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    // Close the connection
    await client.close();
    console.log("Connection closed");
  }
}

main().catch(console.error);
