const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATASET_URL =
  "https://drive.google.com/uc?id=1UqaLbFaveV-3MEuiUrzKydhKmkeC1iAL";

const DATA_DIR = path.join(__dirname, "../sap-o2c-data");

if (!fs.existsSync(DATA_DIR)) {
  console.log("📥 Downloading dataset...");

  execSync(
    `npx gdown ${DATASET_URL} -O dataset.zip`,
    { stdio: "inherit" }
  );

  execSync("unzip dataset.zip -d sap-o2c-data", {
    stdio: "inherit"
  });

  console.log("✅ Dataset downloaded");
} else {
  console.log("📂 Dataset already exists");
}