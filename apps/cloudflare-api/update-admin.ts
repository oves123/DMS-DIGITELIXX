import { connectDB } from "./src/db/mongo";
import Models from "./src/db/models";
import { hashPassword } from "./src/utils/hash";

async function run() {
  await connectDB("mongodb://admin:a3xU8uO8sD03y6Oq@ac-qtz5bns-shard-00-00.t2n26s8.mongodb.net:27017,ac-qtz5bns-shard-00-01.t2n26s8.mongodb.net:27017,ac-qtz5bns-shard-00-02.t2n26s8.mongodb.net:27017/DMS?ssl=true&replicaSet=atlas-2y4jix-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0");
  const hashed = hashPassword("password123");
  await Models.User.updateOne({ phone: "8828807773" }, { $set: { password_hash: hashed } });
  console.log("Admin password updated");
  process.exit(0);
}
run();
