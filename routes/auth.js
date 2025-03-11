const express = require("express");
const router = express.Router();
const User = require("../models/user");


router.get("/", (req, res) => {
  res.json({ message: "This is new message" });
});

router.post("/api/signup", async (req, res) => {
    const {nickname, username, password} = req.body;

    const userExists = await User.findOne({username});
    if (userExists) {
      return res.status(400).json({message: "User with same username already exists"})
    }
    let user = new User (
      {
        nickname, username, password
      }
    )
    user = await user.save();
    res.json(user);
  });

module.exports = router;
