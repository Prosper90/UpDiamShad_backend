console.log("Starting debug...");

try {
  console.log("1. Loading dotenv...");
  require('dotenv').config();
  
  console.log("2. Environment variables loaded");
  console.log("PORT:", process.env.PORT);
  console.log("MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET");
  
  console.log("3. Loading mongoose...");
  const mongoose = require('mongoose');
  
  console.log("4. Attempting MongoDB connection...");
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/diamondz')
    .then(() => {
      console.log("✅ MongoDB connected successfully");
      mongoose.connection.close();
      process.exit(0);
    })
    .catch(err => {
      console.error("❌ MongoDB connection failed:", err.message);
      process.exit(1);
    });
    
  setTimeout(() => {
    console.log("⏱️  Connection timeout after 10s");
    process.exit(1);
  }, 10000);
  
} catch (error) {
  console.error("❌ Error during startup:", error.message);
  process.exit(1);
}