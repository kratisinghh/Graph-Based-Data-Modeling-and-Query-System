const fs = require("fs");
const { execSync } = require("child_process");

const FILE_ID = "1UqaLbFaveV-3MEuiUrzKydhKmkeC1iAL";

try {
  if (!fs.existsSync("sap-o2c-data")) {
    console.log("📥 Downloading dataset from Google Drive...");

    execSync(
      `curl -L -o dataset.zip "https://drive.google.com/uc?export=download&id=${FILE_ID}&confirm=t"`,
      { stdio: "inherit" }
    );

    console.log("📦 Extracting dataset...");
    execSync("unzip dataset.zip -d sap-o2c-data", { stdio: "inherit" });

    console.log("✅ Dataset ready");
  } else {
    console.log("📁 Dataset already exists");
  }
} catch (err) {
  console.error("❌ Dataset download failed:", err.message);
  process.exit(1);
}