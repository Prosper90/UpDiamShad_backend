import dotenv from "dotenv";
import path from "path";

// Load environment variables as early as possible
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`Warning: Could not load .env file from ${envPath}:`, result.error.message);
  // Try to load from parent directory (in case we're running from src)
  const parentEnvPath = path.resolve(process.cwd(), '..', '.env');
  const parentResult = dotenv.config({ path: parentEnvPath });
  if (parentResult.error) {
    console.warn(`Warning: Could not load .env file from ${parentEnvPath}:`, parentResult.error.message);
  }
}

// Validate critical environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'THIRDWEB_CLIENT_ID',
  'THIRDWEB_SECRET_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\n📝 Please ensure your .env file contains all required variables.');
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully');

export {};