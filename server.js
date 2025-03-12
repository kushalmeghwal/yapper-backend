require("dotenv").config();
const express = require("express");
const authRoutes = require("./routes/auth");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use("/api/signup", authRoutes);
app.use("/", authRoutes)

// Connections
mongoose.connect(process.env.DB).then(
  () => {
    console.log("Connected to MongoDB!");
  }
).catch(
  (e) => {
    console.log(e)
  }
)


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});